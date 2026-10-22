// Boot Hono: API JSON + estáticos de public/ + seed al iniciar.

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { existsSync } from "node:fs";
import { mergeConfig } from "./config";
import { createSqliteAdapter } from "./db/sqlite";
import {
  cancelReservation,
  checkAvailability,
  checkPastOverride,
  createReservation,
  ReservationError,
} from "./reservations";
import { seedUnits } from "./seed";

const PORT = Number(process.env.PORT ?? 3000);
const db = createSqliteAdapter();
seedUnits(db);

const app = new Hono();

function errToResponse(err: unknown) {
  if (err instanceof ReservationError) {
    return Response.json({ error: err.code, message: err.message }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: "INTERNAL", message: "Error interno." }, { status: 500 });
}

// --- inventario ---
app.get("/api/units", (c) => c.json(db.listUnits()));

// --- disponibilidad (mismas reglas de overlap que la creación) ---
app.get("/api/availability", (c) => {
  try {
    const unit = c.req.query("unit");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!unit || !from || !to) {
      return c.json(
        { error: "MISSING_PARAMS", message: "Se requieren ?unit=&from=&to=." },
        400,
      );
    }
    return c.json(checkAvailability(db, unit, from, to));
  } catch (err) {
    return errToResponse(err);
  }
});

// --- reservas ---
app.get("/api/reservations", (c) => {
  const unitId = c.req.query("unit") ?? undefined;
  const status = c.req.query("status");
  if (status !== undefined && status !== "active" && status !== "cancelled") {
    return c.json({ error: "INVALID_STATUS", message: "status debe ser active|cancelled." }, 400);
  }
  return c.json(db.listReservations({ unitId, status: status as "active" | "cancelled" | undefined }));
});

app.post("/api/reservations", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const cfg = db.loadConfig();
    const allowPastOverride = checkPastOverride(cfg, body.adminUser, body.adminPass);
    const created = createReservation(
      db,
      {
        unitId: body.unitId ?? body.unit ?? "",
        requester: body.requester ?? "",
        start: body.start ?? "",
        end: body.end ?? "",
      },
      cfg,
      { allowPastOverride },
    );
    return c.json(created, 201);
  } catch (err) {
    return errToResponse(err);
  }
});

app.delete("/api/reservations/:id", (c) => {
  try {
    return c.json(cancelReservation(db, c.req.param("id")));
  } catch (err) {
    return errToResponse(err);
  }
});

// --- config (solo vía UI) ---
app.get("/api/config", (c) => c.json(db.loadConfig()));

app.put("/api/config", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const updated = mergeConfig(db.loadConfig(), body);
    return c.json(db.saveConfig(updated));
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Límite inválido")) {
      return c.json({ error: "INVALID_LIMITS", message: err.message }, 400);
    }
    return errToResponse(err);
  }
});

// --- admin (prototipo) ---
app.post("/api/admin/reset", (c) => {
  db.reset();
  return c.json({ ok: true });
});

// --- estáticos (UI vanilla en public/, sin build step) ---
app.get("/", async (c) => {
  if (existsSync("./public/index.html")) {
    return c.html(await Bun.file("./public/index.html").text());
  }
  return c.json({ ok: true, service: "reservas-lab", units: "/api/units" });
});
app.use("/*", serveStatic({ root: "./public" }));

console.log(`reservas-lab escuchando en http://localhost:${PORT}`);
console.log(`unidades: ${db.listUnits().map((u) => u.id).join(", ")}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
