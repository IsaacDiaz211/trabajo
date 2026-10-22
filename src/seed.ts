// Inventario inicial del PDF + seed idempotente.

import type { DbAdapter, Unit } from "./db/adapter";

export const SEED_UNITS: Unit[] = [
  { id: "MIC-01", name: "Microscopio digital" },
  { id: "MIC-02", name: "Microscopio digital" },
  { id: "OSC-01", name: "Osciloscopio" },
  { id: "MUL-01", name: "Multímetro" },
  { id: "FUE-01", name: "Fuente de alimentación" },
];

/** Inserta las 5 unidades si faltan; nunca borra ni pisa existentes. */
export function seedUnits(db: DbAdapter): Unit[] {
  for (const u of SEED_UNITS) db.ensureUnit(u);
  return db.listUnits();
}
