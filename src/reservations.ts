// Lógica de negocio: validación + overlap + create/cancel/availability.
// Sin dependencias de HTTP ni de SQLite: opera contra DbAdapter.
// Fechas internas siempre ISO 8601 UTC normalizadas (toISOString).

import type { AppConfig } from "./config";
import type {
  CreateReservationInput,
  DbAdapter,
  Reservation,
} from "./db/adapter";

export type ReservationErrorCode =
  | "UNKNOWN_UNIT"
  | "INVALID_REQUESTER"
  | "INVALID_DATES"
  | "INVALID_RANGE"
  | "PAST_NOT_ALLOWED"
  | "INVALID_OVERRIDE"
  | "LIMIT_EXCEEDED"
  | "OVERLAP"
  | "NOT_FOUND";

export class ReservationError extends Error {
  code: ReservationErrorCode;
  status: number;

  constructor(code: ReservationErrorCode, message: string, status = 400) {
    super(message);
    this.name = "ReservationError";
    this.code = code;
    this.status = status;
  }
}

export interface CreateOptions {
  nowMs?: number;
  /** true si el usuario pasó el override demo (modal usuario+contraseña). */
  allowPastOverride?: boolean;
}

export interface ValidatedInput {
  unitId: string;
  requester: string;
  startIso: string;
  endIso: string;
  startMs: number;
  endMs: number;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// ISO 8601 estricto: YYYY-MM-DDTHH:mm con opcional :ss(.frac) y zona Z o ±HH:mm.
// La zona es opcional (hora local si se omite) pero si viene debe ser Z o ±HH:mm.
const STRICT_ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/;

function invalid(field: "start" | "end" | "from" | "to", value: unknown): never {
  throw new ReservationError("INVALID_DATES", `Campo '${field}' inválido: fecha no válida (${value}).`);
}

function parseIso(value: unknown, field: "start" | "end" | "from" | "to"): number {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ReservationError("INVALID_DATES", `Campo '${field}' inválido: debe ser ISO 8601.`);
  }
  const trimmed = value.trim();
  const m = STRICT_ISO_RE.exec(trimmed);
  if (!m) {
    throw new ReservationError(
      "INVALID_DATES",
      `Campo '${field}' inválido: debe ser ISO 8601 (YYYY-MM-DDTHH:mm con opcional :ss y zona Z o ±HH:mm).`,
    );
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = m[6] !== undefined ? Number(m[6]) : 0;
  const frac = m[7];
  const zone = m[8];
  // Validación de rangos reales de calendario (rechaza mes 13, hora 25, etc.).
  if (!(mo >= 1 && mo <= 12)) invalid(field, value);
  if (!(d >= 1 && d <= 31)) invalid(field, value);
  if (!(hh >= 0 && hh <= 23)) invalid(field, value);
  if (!(mm >= 0 && mm <= 59)) invalid(field, value);
  if (m[6] !== undefined && !(ss >= 0 && ss <= 59)) invalid(field, value);
  let offsetMs = 0;
  if (zone !== undefined && zone !== "Z") {
    const sign = zone[0] === "+" ? 1 : -1;
    const oh = Number(zone.slice(1, 3));
    const om = Number(zone.slice(4, 6));
    if (!(oh >= 0 && oh <= 23)) invalid(field, value);
    if (!(om >= 0 && om <= 59)) invalid(field, value);
    offsetMs = sign * (oh * 60 + om) * 60_000;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new ReservationError("INVALID_DATES", `Campo '${field}' inválido: fecha no parseable (${value}).`);
  }
  // Comparar componentes parseados contra el Date resultante para
  // rechazar días inexistentes (p. ej. 2026-02-30) que Date normaliza.
  const fracMs = frac !== undefined ? Number((frac + "000").slice(0, 3)) : 0;
  if (zone !== undefined) {
    // Fecha con zona: comparar en UTC (desplazando por el offset si lo hay).
    const ref = new Date(ms + offsetMs);
    if (
      ref.getUTCFullYear() !== y ||
      ref.getUTCMonth() + 1 !== mo ||
      ref.getUTCDate() !== d ||
      ref.getUTCHours() !== hh ||
      ref.getUTCMinutes() !== mm ||
      ref.getUTCSeconds() !== ss ||
      (frac !== undefined && frac.length <= 3 && ref.getUTCMilliseconds() !== fracMs)
    ) {
      invalid(field, value);
    }
  } else {
    // Sin zona: hora local.
    const ref = new Date(ms);
    if (
      ref.getFullYear() !== y ||
      ref.getMonth() + 1 !== mo ||
      ref.getDate() !== d ||
      ref.getHours() !== hh ||
      ref.getMinutes() !== mm ||
      ref.getSeconds() !== ss ||
      (frac !== undefined && frac.length <= 3 && ref.getMilliseconds() !== fracMs)
    ) {
      invalid(field, value);
    }
  }
  return ms;
}

/** Valida todo salvo persistir; normaliza fechas a UTC. Lanza ReservationError. */
export function validateNewReservation(
  db: DbAdapter,
  input: CreateReservationInput,
  cfg: AppConfig,
  opts: CreateOptions = {},
): ValidatedInput {
  const nowMs = opts.nowMs ?? Date.now();

  const unitId = typeof input.unitId === "string" ? input.unitId.trim() : "";
  if (!unitId || !db.getUnit(unitId)) {
    throw new ReservationError("UNKNOWN_UNIT", `Unidad desconocida: '${input.unitId}'.`);
  }

  const requester = typeof input.requester === "string" ? input.requester.trim() : "";
  if (requester === "") {
    throw new ReservationError("INVALID_REQUESTER", "El solicitante no puede estar vacío.");
  }

  const startMs = parseIso(input.start, "start");
  const endMs = parseIso(input.end, "end");
  if (!(startMs < endMs)) {
    throw new ReservationError("INVALID_RANGE", "El inicio debe ser estrictamente anterior al fin.");
  }

  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  // Pasado: rechazado por defecto, salvo override demo.
  if (startMs < nowMs && !opts.allowPastOverride) {
    throw new ReservationError(
      "PAST_NOT_ALLOWED",
      "No se permiten reservas en el pasado sin override de demostración.",
    );
  }

  // Límites opcionales (null = sin límite, default v1).
  const { maxDurationHours, maxPastDays, maxFutureHours } = cfg.limits;
  if (maxDurationHours !== null && endMs - startMs > maxDurationHours * MS_PER_HOUR) {
    throw new ReservationError(
      "LIMIT_EXCEEDED",
      `La duración supera el máximo de ${maxDurationHours} h.`,
    );
  }
  if (maxFutureHours !== null && startMs - nowMs > maxFutureHours * MS_PER_HOUR) {
    throw new ReservationError(
      "LIMIT_EXCEEDED",
      `El inicio supera el máximo de ${maxFutureHours} h hacia el futuro.`,
    );
  }
  if (maxPastDays !== null && startMs < nowMs && nowMs - startMs > maxPastDays * MS_PER_DAY) {
    throw new ReservationError(
      "LIMIT_EXCEEDED",
      `El inicio supera el máximo de ${maxPastDays} días hacia el pasado.`,
    );
  }

  // Overlap solo contra activas de la misma unidad. end==start permitido.
  const clashes = db.findActiveOverlaps(unitId, startIso, endIso);
  if (clashes.length > 0) {
    throw new ReservationError(
      "OVERLAP",
      `Solapa con la reserva ${clashes[0].id} (${clashes[0].start}–${clashes[0].end}).`,
      409,
    );
  }

  return { unitId, requester, startIso, endIso, startMs, endMs };
}

export function createReservation(
  db: DbAdapter,
  input: CreateReservationInput,
  cfg: AppConfig,
  opts: CreateOptions = {},
): Reservation {
  const v = validateNewReservation(db, input, cfg, opts);
  const nowMs = opts.nowMs ?? Date.now();
  return db.insertReservation({
    id: crypto.randomUUID(),
    unitId: v.unitId,
    requester: v.requester,
    start: v.startIso,
    end: v.endIso,
    status: "active",
    createdAt: new Date(nowMs).toISOString(),
  });
}

/** Pasa a cancelled conservando el registro (idempotente). Lanza NOT_FOUND (404). */
export function cancelReservation(db: DbAdapter, id: string): Reservation {
  const existing = db.getReservation(id);
  if (!existing) {
    throw new ReservationError("NOT_FOUND", `Reserva no encontrada: '${id}'.`, 404);
  }
  if (existing.status === "cancelled") return existing;
  const updated = db.cancelReservation(id);
  if (!updated) throw new ReservationError("NOT_FOUND", `Reserva no encontrada: '${id}'.`, 404);
  return updated;
}

export interface AvailabilityResult {
  unitId: string;
  from: string;
  to: string;
  available: boolean;
}

/** Mismas reglas de overlap que la creación, sin rechazar pasado. */
export function checkAvailability(
  db: DbAdapter,
  unitIdInput: unknown,
  fromInput: unknown,
  toInput: unknown,
): AvailabilityResult {
  const unitId = typeof unitIdInput === "string" ? unitIdInput.trim() : "";
  if (!unitId || !db.getUnit(unitId)) {
    throw new ReservationError("UNKNOWN_UNIT", `Unidad desconocida: '${unitIdInput}'.`);
  }
  const fromMs = parseIso(fromInput, "from");
  const toMs = parseIso(toInput, "to");
  if (!(fromMs < toMs)) {
    throw new ReservationError("INVALID_RANGE", "El inicio debe ser estrictamente anterior al fin.");
  }
  const from = new Date(fromMs).toISOString();
  const to = new Date(toMs).toISOString();
  return { unitId, from, to, available: db.isAvailable(unitId, from, to) };
}

/**
 * Verifica credenciales del override demo contra la config.
 * Devuelve true si coinciden; lanza INVALID_OVERRIDE (403) si se
 * proporcionaron pero son incorrectas; false si no se proporcionaron.
 */
export function checkPastOverride(
  cfg: AppConfig,
  username: unknown,
  password: unknown,
): boolean {
  if (username === undefined && password === undefined) return false;
  if (username === cfg.admin.username && password === cfg.admin.password) return true;
  throw new ReservationError("INVALID_OVERRIDE", "Credenciales demo inválidas.", 403);
}
