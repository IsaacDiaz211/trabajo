import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config";
import type { DbAdapter } from "../src/db/adapter";
import { createSqliteAdapter } from "../src/db/sqlite";
import {
  cancelReservation,
  createReservation,
  ReservationError,
} from "../src/reservations";

const NOW = Date.parse("2026-06-01T12:00:00Z");
const cfg = () => structuredClone(DEFAULT_CONFIG);
const opts = { nowMs: NOW };

let dirs: string[] = [];
let dbs: DbAdapter[] = [];

function makeDb(): DbAdapter {
  const dir = mkdtempSync(join(tmpdir(), "reservas-test-"));
  dirs.push(dir);
  const db = createSqliteAdapter(join(dir, "test.db"));
  dbs.push(db);
  return db;
}

afterEach(() => {
  for (const db of dbs) {
    try { db.close(); } catch { /* noop */ }
  }
  dbs = [];
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* noop */ }
  }
  dirs = [];
});

function expectCode(fn: () => unknown, code: string, status = 400) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ReservationError);
    expect((e as ReservationError).code).toBe(code);
    expect((e as ReservationError).status).toBe(status);
    return;
  }
  throw new Error(`Se esperaba error ${code} pero no lanzó`);
}

test("creación válida", () => {
  const db = makeDb();
  const r = createReservation(
    db,
    { unitId: "MIC-01", requester: "Ana Gómez", start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" },
    cfg(),
    opts,
  );
  expect(r.id.length).toBeGreaterThan(0);
  expect(r.unitId).toBe("MIC-01");
  expect(r.requester).toBe("Ana Gómez");
  expect(r.status).toBe("active");
  // Normalizado a UTC
  expect(r.start).toBe(new Date("2026-07-01T10:00:00Z").toISOString());
  expect(r.end).toBe(new Date("2026-07-01T11:00:00Z").toISOString());
  expect(db.getReservation(r.id)).toEqual(r);
});

test("rechazo superposición misma unidad", () => {
  const db = makeDb();
  createReservation(
    db,
    { unitId: "MIC-01", requester: "Ana", start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" },
    cfg(),
    opts,
  );
  expectCode(
    () => createReservation(db, { unitId: "MIC-01", requester: "Beto", start: "2026-07-01T10:30:00Z", end: "2026-07-01T11:30:00Z" }, cfg(), opts),
    "OVERLAP",
    409,
  );
  // Idéntico intervalo también solapa
  expectCode(
    () => createReservation(db, { unitId: "MIC-01", requester: "Beto", start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" }, cfg(), opts),
    "OVERLAP",
    409,
  );
});

test("consecutivos y distintas unidades permitidos", () => {
  const db = makeDb();
  createReservation(db, { unitId: "MIC-01", requester: "Ana", start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" }, cfg(), opts);
  // Límite consecutivo: end == start no es overlap
  const next = createReservation(db, { unitId: "MIC-01", requester: "Beto", start: "2026-07-01T11:00:00Z", end: "2026-07-01T12:00:00Z" }, cfg(), opts);
  expect(next.status).toBe("active");
  // Simultánea en distinta unidad
  const other = createReservation(db, { unitId: "MIC-02", requester: "Ceci", start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" }, cfg(), opts);
  expect(other.status).toBe("active");
  // Con offset -03:00 equivale a 10:00Z? 07:00-03:00 = 10:00Z: debe solapar con MIC-01 10-11
  expectCode(
    () => createReservation(db, { unitId: "MIC-01", requester: "Dan", start: "2026-07-01T07:30:00-03:00", end: "2026-07-01T08:30:00-03:00" }, cfg(), opts),
    "OVERLAP",
    409,
  );
});

test("entradas inválidas", () => {
  const db = makeDb();
  const base = { unitId: "MIC-01", requester: "Ana", start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" };
  // Unidad desconocida / vacía
  expectCode(() => createReservation(db, { ...base, unitId: "NOPE-99" }, cfg(), opts), "UNKNOWN_UNIT");
  expectCode(() => createReservation(db, { ...base, unitId: "" }, cfg(), opts), "UNKNOWN_UNIT");
  // Requester vacío o solo espacios
  expectCode(() => createReservation(db, { ...base, requester: "" }, cfg(), opts), "INVALID_REQUESTER");
  expectCode(() => createReservation(db, { ...base, requester: "   " }, cfg(), opts), "INVALID_REQUESTER");
  // Fechas no parseables
  expectCode(() => createReservation(db, { ...base, start: "no-es-fecha" }, cfg(), opts), "INVALID_DATES");
  expectCode(() => createReservation(db, { ...base, end: "" }, cfg(), opts), "INVALID_DATES");
  // ISO no estricto: espacio en vez de T, slashes, solo fecha, formato compacto
  for (const bad of ["2026/07/01 10:00", "2026-07-01 10:00:00", "2026-07-01", "20260701T100000", "01-07-2026 10:00", "tomorrow", "10:00"]) {
    expectCode(() => createReservation(db, { ...base, start: bad }, cfg(), opts), "INVALID_DATES");
  }
  // Componentes irreales de calendario: deben ser 400 INVALID_DATES
  for (const bad of ["2026-02-30T10:00", "2026-13-01T10:00:00Z", "2026-07-01T25:00:00Z"]) {
    expectCode(() => createReservation(db, { ...base, start: bad }, cfg(), opts), "INVALID_DATES");
  }
  // start >= end
  expectCode(() => createReservation(db, { ...base, start: "2026-07-01T11:00:00Z", end: "2026-07-01T11:00:00Z" }, cfg(), opts), "INVALID_RANGE");
  expectCode(() => createReservation(db, { ...base, start: "2026-07-01T12:00:00Z", end: "2026-07-01T11:00:00Z" }, cfg(), opts), "INVALID_RANGE");
});

test("cancelación conserva y libera", () => {
  const db = makeDb();
  const r = createReservation(db, { unitId: "MIC-01", requester: "Ana", start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" }, cfg(), opts);
  const c = cancelReservation(db, r.id);
  expect(c.status).toBe("cancelled");
  // Conserva id y datos
  const kept = db.getReservation(r.id);
  expect(kept).not.toBeNull();
  expect(kept!.id).toBe(r.id);
  expect(kept!.unitId).toBe("MIC-01");
  expect(kept!.status).toBe("cancelled");
  // Libera el horario: se puede reservar el mismo intervalo
  const r2 = createReservation(db, { unitId: "MIC-01", requester: "Beto", start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" }, cfg(), opts);
  expect(r2.status).toBe("active");
  expect(r2.id).not.toBe(r.id);
  expect(db.isAvailable("MIC-01", new Date("2026-07-01T10:00:00Z").toISOString(), new Date("2026-07-01T11:00:00Z").toISOString())).toBe(false);
  cancelReservation(db, r2.id);
  expect(db.isAvailable("MIC-01", new Date("2026-07-01T10:00:00Z").toISOString(), new Date("2026-07-01T11:00:00Z").toISOString())).toBe(true);
});

test("persistencia tras reinicio conserva activas y canceladas", () => {
  const dir = mkdtempSync(join(tmpdir(), "reservas-restart-"));
  dirs.push(dir);
  const path = join(dir, "re.db");
  const db1 = createSqliteAdapter(path);
  dbs.push(db1);
  const active = createReservation(db1, { unitId: "MIC-01", requester: "Ana", start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z" }, cfg(), opts);
  const toCancel = createReservation(db1, { unitId: "OSC-01", requester: "Beto", start: "2026-07-02T10:00:00Z", end: "2026-07-02T11:00:00Z" }, cfg(), opts);
  cancelReservation(db1, toCancel.id);
  db1.close();
  dbs = dbs.filter((d) => d !== db1);

  // Reabrir mismo archivo
  const db2 = createSqliteAdapter(path);
  dbs.push(db2);
  const gotActive = db2.getReservation(active.id);
  const gotCancelled = db2.getReservation(toCancel.id);
  expect(gotActive).not.toBeNull();
  expect(gotActive!.status).toBe("active");
  expect(gotCancelled).not.toBeNull();
  expect(gotCancelled!.status).toBe("cancelled");
  // El intervalo de la activa sigue ocupado tras reiniciar
  expectCode(
    () => createReservation(db2, { unitId: "MIC-01", requester: "Otro", start: "2026-07-01T10:30:00Z", end: "2026-07-01T11:30:00Z" }, cfg(), opts),
    "OVERLAP",
    409,
  );
});
