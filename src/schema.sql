-- Sistema de reservas de laboratorio: esquema v1 (SQL estándar).
-- Tablas: units (inventario fijo) y reservations (historial con borrado lógico).

CREATE TABLE IF NOT EXISTS units (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id         TEXT PRIMARY KEY,
  unit_id    TEXT NOT NULL REFERENCES units (id),
  requester  TEXT NOT NULL,
  "start"    TEXT NOT NULL,
  "end"      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_reservations_unit_status
  ON reservations (unit_id, status);
