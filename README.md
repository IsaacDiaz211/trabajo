# Sistema de reservas de laboratorio

Reemplazo local de planilla + mensajes para consultar disponibilidad, reservar y cancelar unidades sin perder historial. Detalle de requisitos en [spec.md](./spec.md), diseño en [plan.md](./plan.md).

## 1. Especificación breve

**Problema:** la coordinación gestiona reservas por planilla y mensajes, sin control de solapes ni historial. **Alcance (PDF):** leer inventario precargado (sin administrarlo), consultar disponibilidad por unidad e intervalo, crear reservas identificables (unidad + solicitante ficticio no vacío + inicio + fin), cancelar conservando id y datos (libera el intervalo) y persistir todo ante reinicios. Fuera de alcance: auth/roles reales, notificaciones, pagos, integraciones, despliegue obligatorio, GUI compleja, concurrencia distribuida.

**Requisitos R1–R10:** R1 `GET /api/units` devuelve las 5 unidades; R2 `GET /api/availability?unit=&from=&to=` aplica las mismas reglas de overlap que la creación; R3 `POST /api/reservations` crea con id único si valida; R4 rechaza superposición activa misma unidad (MIC-01 10:00–11:00 rechaza 10:30–11:30); R5 permite límites consecutivos (11:00–12:00 tras 10:00–11:00) y simultáneas en distinta unidad; R6 valida unidad conocida, `requester` no vacío ni solo espacios, fechas válidas, `start < end` estricto; R7 `DELETE /api/reservations/:id` pasa a `cancelled`, conserva el registro y libera el horario; R8 tras detener y reiniciar sin borrar datos se conservan activas y canceladas; R9 configuración solo vía UI (`GET/PUT /api/config`); R10 `POST /api/admin/reset` borra reservas, conserva inventario, con modal de confirmación.

**Regla de overlap:** `nuevo.start < existente.end && existente.start < nuevo.end`, solo contra reservas `active` de la misma unidad; `end == start` no solapa (intervalos `[start, end)`).

**Supuestos:** interno siempre UTC, visualización default `America/Argentina/Buenos_Aires` (UTC-3) cambiable solo por UI (acepta IANA o `UTC±N` con N 0–14); fechas ISO 8601 estricta (`YYYY-MM-DDTHH:mm` con opcional `:ss` y zona `Z` o `±HH:mm`, con validación de calendario real: rechaza p. ej. 2026-02-30); fechas pasadas rechazadas por defecto, con override demo vía modal (usuario + contraseña precargados, no editables, aceptar siempre habilitado — no es seguridad real); límites v1 sin límite (`maxDurationHours`, `maxPastDays`, `maxFutureHours` en `null`) pero configurables por UI; reset borra reservas permanentemente; persistencia con patrón Adaptador (`DbAdapter`), v1 con `bun:sqlite`; `data/reservas.db` y `data/config.json` son runtime, no versionados.

**Criterios de aceptación:** `bun test` en verde (14 pass, 0 fail, 163 expects el 2026-10-22) + verificación manual de reinicio documentada en [docs/RESTART.md](./docs/RESTART.md). Ver [spec.md](./spec.md).

## 2. Solución

**Estructura:** `src/index.ts` (boot Hono + estáticos + seed), `src/config.ts` (defaults + `./data/config.json`), `src/db/adapter.ts` (interfaz `DbAdapter`), `src/db/sqlite.ts` (implementación `bun:sqlite`), `src/schema.sql` (tablas `units` + `reservations`), `src/reservations.ts` (validación + overlap + CRUD), `src/seed.ts` (inventario inicial), `public/index.html` (UI vanilla sin build step: unidades, crear, tabla con filtros, disponibilidad, Configuración, modales), `tests/` (3 archivos `bun:test`), `data/` runtime (no versionado).

**Decisiones:** Bun 1.3.12, Hono (sin adaptador propietario), pnpm 11.1.3 + `pnpm-lock.yaml`, SQLite vía `bun:sqlite` detrás del Adaptador (migrable a Postgres/D1 sin tocar la lógica), UI vanilla servida por el mismo Hono. Un solo `bun run` levanta todo en VPS/PC. Ver [plan.md](./plan.md).

**Requisitos previos y versiones verificadas:** Bun 1.3.12 (`bun --version`), pnpm 11.1.3, SQLite 3.50.6 según plan (`sqlite_version()` observada 3.51.2 el 2026-10-22). Sin servicios pagos.

**Instalación y seed:** `pnpm install`. Al arrancar, el seed inserta idempotentemente las 5 unidades del PDF (nunca borra ni pisa): MIC-01 y MIC-02 Microscopio digital, OSC-01 Osciloscopio, MUL-01 Multímetro, FUE-01 Fuente de alimentación.

**Comandos:** app `bun run src/index.ts` (también `pnpm dev`; puerto 3000, configurable con `PORT`; `DB_PATH`/`CONFIG_PATH` para mover los archivos); tests `bun test` (14 pass, 0 fail, 163 expects el 2026-10-22).

**Ejemplo entrada/salida (observado el 2026-10-22):** `POST /api/reservations {"unitId":"MIC-01","requester":"Ana Gómez","start":"2027-03-10T10:00:00Z","end":"2027-03-10T11:00:00Z"}` → `201 {"id":"0201fae1-…","unitId":"MIC-01","status":"active","start":"2027-03-10T10:00:00.000Z",…}`; repetir solapado `{"unitId":"MIC-01",…,"start":"2027-03-10T10:30:00Z","end":"2027-03-10T11:30:00Z"}` → `409 {"error":"OVERLAP",…}`. Disponibilidad: `GET /api/availability?unit=MIC-01&from=…&to=…` → `{"available":false,…}`.

**Persistencia:** `./data/reservas.db` (reservas + inventario) y `./data/config.json` (timezone, límites, admin demo), ambos no versionados (ver `.gitignore`; `git status` limpio salvo código). **Reinicio de datos:** `POST /api/admin/reset` borra **todas las reservas permanentemente** y conserva el inventario; la UI exige modal con el texto "Cuidado. Resetear la base de datos borrará de forma permanente …" + "En futuras versiones se introducirá un sistema de backup." (`public/index.html:175-176`). **Advertencia:** el reset no se puede deshacer y aún no hay backup.

**Pendientes y limitaciones:** en serverless gratuito SQLite es efímero/no disponible: requiere otro `DbAdapter` (D1/Postgres); el override demo (`admin`/`admin` documentado en `src/config.ts:32-35`) no es seguridad ni roles reales; backup ante reset pendiente. Verificación de reinicio: [docs/RESTART.md](./docs/RESTART.md).

## 3. Preparación del agente

**Entorno:** OpenCode 1.16.2 (`opencode --version`) en modo `build`: coordina modelo, herramientas y ejecución sobre el repo, sin harness propio. **Modelo de esta sesión:** `opencode-go/muse-spark-1.3-contributor` (coincide con `general`/`worker` de la config global `~/.config/opencode/opencode.json`, externa al repo — no hay `opencode.json` local). Extracto saneado (sin secretos, tal cual se reutiliza): `general` y `worker` → `opencode-go/muse-spark-1.3-contributor` (subagent); `scout` → `inception/mercury-2.5`; `explore` → `fireworks-ai/.../glm-5p3-flash`; escalations en modelos más potentes solo como último recurso por costo. Motivo de elección: modelo más inteligente al menor costo disponible para la suscripción; scout/explore rápidos para lectura.

**Instrucciones al agente:** implementar según spec/plan, cerrar gaps que marque el revisor, validar inputs siempre, correr tests antes de cada commit, nunca commitear secretos ni editar `~/.config/opencode/`, no borrar tests que fallan sin aprobación, preguntar antes de agregar dependencias o cambiar esquema/deploy, devolver bloque `RESUMEN_AGENTE`, no hacer commit.

**Contexto:** incluido `challenge-agents.pdf` (consigna, 3 páginas); excluido resto del filesystem fuera de `trabajo/`, chats privados, credenciales y datos reales. Directorio de trabajo `/home/isaac/Documentos/LSI/Topicos/trabajo` (+ `/tmp/opencode` para temporales).

**Permisos y controles humanos:** el agente opera solo dentro de `trabajo/` con herramientas reales (bash, read/write/edit, glob/grep, subagentes, web/context7); todo cambio se revisa con `git status` / `git diff` y la aprobación humana es manual antes de cada commit y antes de dar por válido un resultado. Sin secretos en el repo: `data/` sigue ignorado (verificado con `git check-ignore`: `data/*.db` y `data/config.json` matchean `.gitignore`; `git ls-files` no lista `data/`) y `admin`/`admin` figura solo como credencial demo documentada en `src/config.ts:32-35`, no como secreto real.

**Adaptación específica comprobable:** validación de turnos consecutivos `end == start` permitido — consulta SQL en `src/db/sqlite.ts:68-75` (`? < "end" AND "start" < ?`), chequeo en `src/reservations.ts:193-201`, contrato en `src/db/adapter.ts:51`, test en `tests/reservations.test.ts:91-106` (consecutiva 201 + simultánea otra unidad + solape con offset `-03:00` → 409); persistencia con test de reinicio en `tests/reservations.test.ts:153-180` (cierra y reabre el archivo, conserva activa y cancelada, overlap sigue 409) más verificación manual de punta a punta en [docs/RESTART.md](./docs/RESTART.md). Retención del progreso en [DECISIONS.md](./DECISIONS.md). Ver [work_enviroment.md](./work_enviroment.md) y [DECISIONS.md](./DECISIONS.md).

## 4. Registro de decisiones y delegación

**Episodio 1 (SATISFIES):** worker implementó base API + persistencia + reglas según spec/plan (archivos nuevos, sin commit); reviewer pidió 2 iteraciones (ISO estricto + UI config + modal reset + tests; luego validación de calendario real que rechaza 2026-02-30); decisión humana aceptar con 10/10 requisitos y `bun test` 6 pass (88 expects, Bun 1.3.12). **Episodio 2 (SATISFIES):** 3 fixes UI configuración (zona flexible IANA + `UTC±N` 0–14 en `src/config.ts`, labels humanas, modal `#modal-save-config` con texto exacto y PUT solo al aceptar en `public/index.html:186,361-376`); reviewer pidió 1 fix (limpiar texto manual al tocar controles, `public/index.html:361-363` + test `tests/timezone-ui.test.ts:60-135`); decisión humana aceptar con `bun test` 14 pass (163 expects). **Episodio 3 (este):** README de 4 secciones + verificación manual de reinicio reproducible (servidor real: 1 activa + 1 cancelada conservadas tras reinicio, overlap 409, hueco liberado 201) documentada en `docs/RESTART.md`; `bun test` 14 pass, 0 fail, 163 expects; `data/` verificado ignorado y `admin`/`admin` solo demo documentada; sin commit. Detalle y evidencias en [DECISIONS.md](./DECISIONS.md).
