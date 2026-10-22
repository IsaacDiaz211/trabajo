// Configuración runtime: defaults en código, persistencia en ./data/config.json.
// La config solo se edita vía UI (PUT /api/config); nunca a mano.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface LimitsConfig {
  maxDurationHours: number | null;
  maxPastDays: number | null;
  maxFutureHours: number | null;
}

/** Credenciales demo para el override de fechas pasadas. NO es seguridad real. */
export interface AdminDemo {
  username: string;
  password: string;
}

export interface AppConfig {
  timezone: string;
  limits: LimitsConfig;
  admin: AdminDemo;
}

export const DEFAULT_CONFIG: AppConfig = {
  timezone: "America/Argentina/Buenos_Aires",
  limits: {
    maxDurationHours: null,
    maxPastDays: null,
    maxFutureHours: null,
  },
  admin: {
    username: "admin",
    password: "admin",
  },
};

export const CONFIG_PATH = resolve(
  process.cwd(),
  process.env.CONFIG_PATH ?? "./data/config.json",
);

/** Acepta `UTC±N` con N entero 0-14 (ej. UTC-5, UTC+9, UTC+0, UTC+14). */
const UTC_OFFSET_RE = /^UTC([+-])(\d{1,2})$/;

/** Válido si es IANA reconocida por Intl o `UTC±N` con N 0-14. */
export function isValidTimezone(tz: unknown): boolean {
  if (typeof tz !== "string") return false;
  const t = tz.trim();
  if (t === "") return false;
  const m = UTC_OFFSET_RE.exec(t);
  if (m) {
    const n = Number(m[2]);
    return Number.isInteger(n) && n >= 0 && n <= 14;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

export function assertValidTimezone(tz: string): void {
  if (!isValidTimezone(tz)) {
    throw new Error(
      `Zona horaria inválida: debe ser IANA válida o UTC±N con N 0-14 (recibido: ${JSON.stringify(tz)})`,
    );
  }
}

/** Mezcla parcial sobre los defaults (merge profundo de un nivel). */
export function mergeConfig(base: AppConfig, patch: unknown): AppConfig {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const p = patch as Partial<AppConfig>;
  return {
    timezone: (() => {
      if (typeof p.timezone === "string" && p.timezone.trim() !== "") {
        const tz = p.timezone.trim();
        assertValidTimezone(tz);
        return tz;
      }
      return base.timezone;
    })(),
    limits: {
      maxDurationHours: normLimit(p.limits?.maxDurationHours, base.limits.maxDurationHours),
      maxPastDays: normLimit(p.limits?.maxPastDays, base.limits.maxPastDays),
      maxFutureHours: normLimit(p.limits?.maxFutureHours, base.limits.maxFutureHours),
    },
    admin: {
      username:
        typeof p.admin?.username === "string" && p.admin.username !== ""
          ? p.admin.username
          : base.admin.username,
      password:
        typeof p.admin?.password === "string" && p.admin.password !== ""
          ? p.admin.password
          : base.admin.password,
    },
  };
}

function normLimit(v: unknown, fallback: number | null): number | null {
  if (v === undefined) return fallback;
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  throw new Error(`Límite inválido: debe ser null o número >= 0 (recibido: ${JSON.stringify(v)})`);
}

export function loadConfig(path: string = CONFIG_PATH): AppConfig {
  if (!existsSync(path)) return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return mergeConfig(structuredClone(DEFAULT_CONFIG), raw);
  } catch {
    // config.json corrupto: se vuelve a defaults sin romper el arranque
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(cfg: AppConfig, path: string = CONFIG_PATH): AppConfig {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
  return cfg;
}
