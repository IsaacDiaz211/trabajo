// Interfaz del patrón Adaptador: la lógica de negocio solo habla contra
// DbAdapter, de modo que el motor (hoy bun:sqlite) se puede reemplazar
// (Postgres/D1) sin tocar src/reservations.ts ni src/index.ts.

import type { AppConfig } from "../config";

export type ReservationStatus = "active" | "cancelled";

export interface Unit {
  id: string;
  name: string;
}

export interface Reservation {
  id: string;
  unitId: string;
  requester: string;
  /** ISO 8601 UTC normalizado */
  start: string;
  /** ISO 8601 UTC normalizado */
  end: string;
  status: ReservationStatus;
  createdAt: string;
}

export interface CreateReservationInput {
  unitId: string;
  requester: string;
  start: string;
  end: string;
}

export interface ReservationFilter {
  unitId?: string;
  status?: ReservationStatus;
}

export interface DbAdapter {
  // --- inventario (precargado, no administrable por API) ---
  listUnits(): Unit[];
  getUnit(id: string): Unit | null;
  /** Inserta la unidad solo si no existe (idempotente, para seed). */
  ensureUnit(unit: Unit): void;

  // --- reservas ---
  listReservations(filter?: ReservationFilter): Reservation[];
  getReservation(id: string): Reservation | null;
  insertReservation(r: Reservation): Reservation;
  /** Marca cancelled conservando el registro; null si no existe. */
  cancelReservation(id: string): Reservation | null;
  /** Activas de la misma unidad que solapan [start, end). end==start NO solapa. */
  findActiveOverlaps(unitId: string, startIso: string, endIso: string): Reservation[];
  /** true si ninguna activa de la unidad solapa el intervalo. */
  isAvailable(unitId: string, fromIso: string, toIso: string): boolean;

  // --- admin ---
  /** Borra reservas permanentemente, conserva inventario. */
  reset(): void;

  // --- config (persistida en ./data/config.json, ver src/config.ts) ---
  loadConfig(): AppConfig;
  saveConfig(cfg: AppConfig): AppConfig;

  close(): void;
}
