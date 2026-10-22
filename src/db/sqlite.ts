// Adaptador SQLite vía bun:sqlite. SQL estándar, sin extensiones propietarias.
// Archivo: ./data/reservas.db (o $DB_PATH). Crea esquema + seed al iniciar.

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig, saveConfig, type AppConfig } from "../config";
import { SEED_UNITS } from "../seed";
import type {
  DbAdapter,
  Reservation,
  ReservationFilter,
  Unit,
} from "./adapter";

export const DB_PATH = resolve(process.cwd(), process.env.DB_PATH ?? "./data/reservas.db");
const SCHEMA_PATH = resolve(import.meta.dir, "../schema.sql");

interface ReservationRow {
  id: string;
  unit_id: string;
  requester: string;
  start: string;
  end: string;
  status: "active" | "cancelled";
  created_at: string;
}

function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    unitId: row.unit_id,
    requester: row.requester,
    start: row.start,
    end: row.end,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function createSqliteAdapter(dbPath: string = DB_PATH): DbAdapter {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  // Esquema idempotente (CREATE TABLE IF NOT EXISTS).
  const schema = readFileSync(existsSync(SCHEMA_PATH) ? SCHEMA_PATH : resolve(process.cwd(), "src/schema.sql"), "utf-8");
  db.exec(schema);

  const qListUnits = db.query<ReservationRow & Unit, []>("SELECT id, name FROM units ORDER BY id;");
  const qGetUnit = db.query<Unit, [string]>("SELECT id, name FROM units WHERE id = ?;");
  const qEnsureUnit = db.query<unknown, [string, string]>(
    "INSERT OR IGNORE INTO units (id, name) VALUES (?, ?);",
  );
  const qInsert = db.query<unknown, [string, string, string, string, string, string, string]>(
    `INSERT INTO reservations (id, unit_id, requester, "start", "end", status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
  );
  const qGet = db.query<ReservationRow, [string]>(
    `SELECT id, unit_id, requester, "start", "end", status, created_at
     FROM reservations WHERE id = ?;`,
  );
  const qCancel = db.query<ReservationRow, [string]>(
    `UPDATE reservations SET status = 'cancelled' WHERE id = ?
     RETURNING id, unit_id, requester, "start", "end", status, created_at;`,
  );
  // Overlap: nuevo.start < existente.end AND existente.start < nuevo.end.
  // end == start NO cuenta como solape (intervalos [start, end)).
  const qOverlaps = db.query<ReservationRow, [string, string, string]>(
    `SELECT id, unit_id, requester, "start", "end", status, created_at
     FROM reservations
     WHERE unit_id = ? AND status = 'active' AND ? < "end" AND "start" < ?
     ORDER BY "start";`,
  );

  // Seed de inventario: idempotente, no pisa nombres existentes.
  for (const u of SEED_UNITS) qEnsureUnit.run(u.id, u.name);

  return {
    listUnits(): Unit[] {
      return qListUnits.all() as unknown as Unit[];
    },

    getUnit(id: string): Unit | null {
      return (qGetUnit.get(id) as unknown as Unit | null) ?? null;
    },

    ensureUnit(unit: Unit): void {
      qEnsureUnit.run(unit.id, unit.name);
    },

    listReservations(filter?: ReservationFilter): Reservation[] {
      const conds: string[] = [];
      const params: string[] = [];
      if (filter?.unitId) {
        conds.push("unit_id = ?");
        params.push(filter.unitId);
      }
      if (filter?.status) {
        conds.push("status = ?");
        params.push(filter.status);
      }
      const sql =
        `SELECT id, unit_id, requester, "start", "end", status, created_at FROM reservations` +
        (conds.length > 0 ? ` WHERE ${conds.join(" AND ")}` : "") +
        ` ORDER BY "start";`;
      return (db.query<ReservationRow, string[]>(sql).all(...params) as ReservationRow[]).map(toReservation);
    },

    getReservation(id: string): Reservation | null {
      const row = qGet.get(id);
      return row ? toReservation(row) : null;
    },

    insertReservation(r: Reservation): Reservation {
      qInsert.run(r.id, r.unitId, r.requester, r.start, r.end, r.status, r.createdAt);
      return r;
    },

    cancelReservation(id: string): Reservation | null {
      const row = qCancel.get(id);
      return row ? toReservation(row) : null;
    },

    findActiveOverlaps(unitId: string, startIso: string, endIso: string): Reservation[] {
      return (qOverlaps.all(unitId, startIso, endIso) as ReservationRow[]).map(toReservation);
    },

    isAvailable(unitId: string, fromIso: string, toIso: string): boolean {
      return qOverlaps.all(unitId, fromIso, toIso).length === 0;
    },

    reset(): void {
      db.exec("DELETE FROM reservations;");
    },

    loadConfig(): AppConfig {
      return loadConfig();
    },

    saveConfig(cfg: AppConfig): AppConfig {
      return saveConfig(cfg);
    },

    close(): void {
      db.close();
    },
  };
}
