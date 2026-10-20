# Plan técnico — sistema de reservas

## 1. Objetivo
API local + UI mínima para consultar disponibilidad, crear y cancelar reservas de 5 unidades, con persistencia en archivo y reglas del PDF.

## 2. Stack (deployment agnostic)
- Runtime: Bun 1.3.12 (`bun --version` verificado)
- Framework: Hono (sin adaptador propietario; `hono/node-server` o `hono` puro según target)
- Package manager: pnpm 11.1.3 + `pnpm-lock.yaml`
- DB prototipo: SQLite 3.50.6 en archivo `./data/reservas.db` vía `bun:sqlite`, detrás de patrón Adaptador (`DbAdapter`) para migrar a Postgres/D1 sin tocar la lógica.
- Config: editable solo desde la interfaz web (pantalla Configuración). Persiste en `./data/config.json` (no versionado, con defaults en código). No se edita JSON manual.
- UI: `public/index.html` + CSS + JS vanilla, servido por el mismo Hono (sin build step)
- Lenguaje: TypeScript

Por qué: un solo `bun run` levanta todo; mismo código corre en VPS, PC personal, Vercel (Node) o Cloudflare Workers (con adaptador). Sin servicios pagos.

Límite declarado: en Vercel/Cloudflare gratis el archivo SQLite es efímero o no disponible. Ahí la persistencia requiere implementar otro `DbAdapter` (D1/Postgres). En VPS/PC persiste sin cambios.

## 3. Estructura
```
src/
  index.ts        → boot Hono + static + seed
  config.ts       → lee/escribe ./data/config.json (timezone, límites, admin demo)
  db/
    adapter.ts    → interfaz DbAdapter
    sqlite.ts     → implementación bun:sqlite
  schema.sql      → units + reservations
  reservations.ts → validación + overlap + CRUD
  seed.ts         → inventario inicial (5 unidades del PDF)
public/
  index.html      → UI mínima + modales prototipo + pantalla Configuración
data/
  config.json     → generado en runtime (no versionado)
  reservas.db     → creado en runtime (no versionado)
tests/
  reservations.test.ts → 6 casos obligatorios (bun:test)
```

## 4. Componentes y endpoints
- `GET /api/units` → inventario
- `GET /api/availability?unit=MIC-01&from=ISO&to=ISO` → bool con mismas reglas de overlap
- `POST /api/reservations` `{unitId, requester, start, end}` → 201 + id, o 400/409 según validación
- `DELETE /api/reservations/:id` → marca `cancelled`, conserva registro
- `POST /api/admin/reset` → borra reservas (conserva inventario). Solo prototipo.
- `GET /api/config` → lee configuración actual (timezone, límites)
- `PUT /api/config` → actualiza configuración solo desde la UI
- Reglas: unidad conocida, `requester.trim() !== ''`, `start < end` estricto, overlap solo contra `active` misma unidad, límites consecutivos permitidos (`end == start` no es overlap).

## 4.1 Decisiones de prototipo (fijadas por el usuario)
- Zona horaria: `America/Argentina/Buenos_Aires` (UTC-3) por defecto, formato ISO 8601. Cambiable solo vía UI → pantalla Configuración.
- Fechas pasadas: por defecto se rechazan; se permite operar en pasado solo con override demo (modal usuario+contraseña). Modal con campos precargados y no editables, botón aceptar siempre habilitado. Backend valida contra valores demo de la config. Se documenta que no es un sistema real de permisos/roles.
- Límites: sin límite en v1 (`null`), pero configurables solo vía UI: `maxDurationHours`, `maxPastDays`, `maxFutureHours`.
- Reset: borra reservas de forma permanente. UI exige modal con texto: "Cuidado. Resetear la base de datos borrará de forma permanente ..." + "En futuras versiones se introducirá un sistema de backup.".

## 5. Orden de implementación
1. `schema.sql` + `db.ts` + seed inventario
2. `reservations.ts` (validación + overlap)
3. Rutas Hono + `index.ts`
4. `public/index.html` mínimo
5. Tests `bun:test` (6 casos + persistencia restart)
6. README 4 secciones + verificación manual de reinicio

## 6. Riesgos
- `bun:sqlite` ata a Bun → mitigación: patrón Adaptador (`DbAdapter`), SQL estándar.
- Reloj/zona horaria → mitigación: todo se normaliza a UTC interno, se muestra en `America/Argentina/Buenos_Aires` por defecto.
- Persistencia en serverless → mitigación: variable `DB_PATH`, documentado como limitación.

## 7. Verificación
- `pnpm install`
- `bun run src/index.ts` (o `pnpm dev`)
- `bun test` — debe pasar 6/6
- Manual: crear → detener → reiniciar → `GET` conserva activas y canceladas
- `git status` / `git diff` revisados por humano antes de cada commit
