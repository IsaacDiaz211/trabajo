# Sistema de reservas de laboratorio

Reemplazo local de planilla y mensajes para consultar disponibilidad, reservar y cancelar unidades sin perder historial. Requisitos en [spec.md](./spec.md), diseño en [plan.md](./plan.md).

## 1. Especificación breve

**Problema.** La coordinación gestiona reservas por planilla y mensajes, sin control de solapes ni historial.

**Alcance (PDF).**
- Leer el inventario precargado, sin administrarlo.
- Consultar disponibilidad por unidad e intervalo.
- Crear reservas identificables: unidad + solicitante ficticio no vacío + inicio + fin.
- Cancelar conservando id y datos. La cancelación libera el intervalo.
- Persistir todo ante reinicios.

Fuera de alcance: auth y roles reales, notificaciones, pagos, integraciones externas, despliegue obligatorio, GUI compleja, concurrencia distribuida.

**Requisitos R1–R10.**
- R1: `GET /api/units` devuelve las 5 unidades.
- R2: `GET /api/availability` aplica las mismas reglas de overlap que la creación.
- R3: `POST /api/reservations` crea con id único si valida.
- R4: rechaza superposición activa en la misma unidad. Ejemplo: MIC-01 de 10:00 a 11:00 rechaza 10:30 a 11:30.
- R5: permite límites consecutivos (11:00 a 12:00 tras 10:00 a 11:00) y simultáneas en distinta unidad.
- R6: valida unidad conocida, solicitante no vacío ni solo espacios, fechas válidas y `start < end` estricto.
- R7: `DELETE /api/reservations/:id` pasa a `cancelled`, conserva el registro y libera el horario.
- R8: tras detener y reiniciar sin borrar datos, se conservan activas y canceladas.
- R9: configuración solo vía UI (`GET/PUT /api/config`).
- R10: `POST /api/admin/reset` borra reservas, conserva inventario y exige modal de confirmación.

**Regla de overlap.** Una reserva nueva solapa si `nuevo.start < existente.end` y `existente.start < nuevo.end`. Solo se compara contra reservas `active` de la misma unidad. Los intervalos son `[start, end)`: `end == start` no solapa.

**Supuestos.**
- Interno siempre en UTC. Se muestra en `America/Argentina/Buenos_Aires` (UTC-3) por defecto, cambiable solo por UI. Acepta zonas IANA o `UTC±N` con N de 0 a 14.
- Fechas en ISO 8601 estricta, con validación de calendario real (rechaza, por ejemplo, 2026-02-30).
- Fechas pasadas rechazadas por defecto. Se permite operar en pasado solo con el modal demo (usuario y contraseña precargados, no editables, aceptar siempre habilitado). No es seguridad real.
- Sin límite de duración ni anticipación en v1, pero configurables por UI.
- El reset borra reservas permanentemente.
- Persistencia con patrón Adaptador. La v1 usa `bun:sqlite`.
- `data/reservas.db` y `data/config.json` son runtime y no se versionan.

**Aceptación.** `bun test` en verde (14 pass el 2026-10-22) más verificación manual de reinicio en [docs/RESTART.md](./docs/RESTART.md).

## 2. Solución

**Estructura.**
- `src/index.ts`: arranque Hono, estáticos y seed.
- `src/config.ts`: defaults y lectura de `./data/config.json`.
- `src/db/adapter.ts`: interfaz `DbAdapter`.
- `src/db/sqlite.ts`: implementación con `bun:sqlite`.
- `src/schema.sql`: tablas `units` y `reservations`.
- `src/reservations.ts`: validación, overlap y CRUD.
- `src/seed.ts`: inventario inicial.
- `public/index.html`: UI vanilla sin build (unidades, crear, tabla con filtros, disponibilidad, Configuración, modales).
- `tests/`: 3 archivos con `bun:test`.
- `data/`: runtime, no versionado.

**Decisiones.** Bun 1.3.12, Hono con arranque actual en Bun y rutas portables a otros runtimes, pnpm 11.1.3 con `pnpm-lock.yaml`, SQLite detrás del Adaptador (migrable a Postgres o D1 sin tocar la lógica), UI servida por el mismo Hono. Un solo comando levanta todo en VPS o PC. Detalle en [plan.md](./plan.md).

**Requisitos previos.** Bun 1.3.12, pnpm 11.1.3, SQLite 3.50.6 según plan (`sqlite_version()` observada 3.51.2 el 2026-10-22). Sin servicios pagos.

**Instalación y seed.** `pnpm install`. Al arrancar, el seed inserta las 5 unidades del PDF sin borrar ni pisar: MIC-01 y MIC-02 (microscopio), OSC-01 (osciloscopio), MUL-01 (multímetro), FUE-01 (fuente).

**Comandos.**
- App: `bun run src/index.ts` (también `pnpm dev`; puerto 3000, configurable con `PORT`; `DB_PATH` y `CONFIG_PATH` para mover archivos).
- Tests: `bun test` (14 pass, 0 fail, 163 expects el 2026-10-22).

**Ejemplo observado el 2026-10-22.**
- Crear: `POST /api/reservations` con MIC-01 de 10:00 a 11:00 → `201` con id y `status: active`.
- Solape: mismo intervalo de 10:30 a 11:30 → `409 OVERLAP`.
- Disponibilidad: `GET /api/availability?unit=MIC-01&from=...&to=...` → `{"available": false}`.

**Persistencia y reset.**
- Reservas e inventario en `./data/reservas.db`. Configuración en `./data/config.json`. Ninguno se versiona.
- `POST /api/admin/reset` borra todas las reservas permanentemente y conserva el inventario. La UI exige un modal con el aviso de borrado permanente y que en futuras versiones habrá backup. El reset no se puede deshacer y aún no hay backup.

**Pendientes y limitaciones.**
- En serverless gratuito, SQLite es efímero o no disponible. Requiere otro `DbAdapter` (D1 o Postgres).
- El override demo (`admin`/`admin` en `src/config.ts`) no es seguridad ni roles reales.
- Backup ante reset, pendiente.

Reinicio verificado en [docs/RESTART.md](./docs/RESTART.md).

## 3. Preparación del agente

**Entorno.** Harness existente OpenCode 1.16.2 en modo `build`. No se construyó un harness propio, según pide la consigna. Coordina modelo, herramientas y ejecución sobre el repo.

**Modelo de esta sesión.** `opencode-go/muse-spark-1.3-contributor`. Es el configurado para `general` y `worker` en la config global `~/.config/opencode/opencode.json`, externa al repo (no hay `opencode.json` local). Se reutiliza el modelo ya configurado en el entorno existente. Extracto saneado, sin secretos: `general` y `worker` usan `opencode-go/muse-spark-1.3-contributor`; `scout` usa `inception/mercury-2.5`; `explore` usa `fireworks-ai/.../glm-5p3-flash`.

**Instrucciones.** Implementar según spec y plan. Cerrar los gaps que marque el revisor. Validar inputs siempre. Correr tests antes de cada commit. Nunca commitear secretos ni editar la config global. No borrar tests que fallan sin aprobación. Preguntar antes de agregar dependencias o cambiar esquema y deploy. Devolver bloque `RESUMEN_AGENTE`. No hacer commit.

**Contexto.** Incluido: `challenge-agents.pdf` (consigna de 3 páginas). Excluido: resto del filesystem fuera de `trabajo/`, chats privados, credenciales y datos reales. Trabajo en `/home/isaac/Documentos/LSI/Topicos/trabajo` más `/tmp/opencode` para temporales.

**Permisos y controles humanos.** El agente opera solo dentro de `trabajo/` con herramientas reales (terminal, lectura y edición, búsqueda, subagentes, web y context7). Todo cambio se revisa con `git status` y `git diff`. La aprobación humana es manual antes de cada commit y antes de dar por válido un resultado. En el repo no hay secretos: `data/` está ignorado (`git ls-files` no lista `data/`) y `admin`/`admin` figura solo como credencial demo documentada, no como secreto real.

**Adaptación específica comprobable.** Turnos consecutivos permitidos (`end == start` no solapa): consulta en `src/db/sqlite.ts`, chequeo en `src/reservations.ts`, contrato en `src/db/adapter.ts` y test en `tests/reservations.test.ts`. Persistencia ante reinicio: test que cierra y reabre el archivo más verificación manual de punta a punta en [docs/RESTART.md](./docs/RESTART.md). Progreso en [DECISIONS.md](./DECISIONS.md) y [work_enviroment.md](./work_enviroment.md).

## 4. Registro de decisiones y delegación

**Episodio 1 (SATISFIES).** El worker implementó API, persistencia y reglas según spec y plan. El reviewer pidió dos iteraciones: primero ISO 8601 estricto, UI de configuración, modal de reset y tests; después validación de calendario real (rechaza 2026-02-30). Decisión humana: aceptar, con 10 de 10 requisitos y `bun test` en 6 pass.

**Episodio 2 (SATISFIES).** Nació de un control manual humano de la UI: al revisar la pantalla de Configuración con una captura, se detectaron 3 errores básicos: pocas zonas horarias (solo 7), etiquetas con nombres de variables y guardado sin confirmación. El worker lo corrigió con zona ampliada (lista IANA más offset `UTC±N` de 0 a 14), etiquetas en lenguaje natural y modal de confirmación con "¿Seguro que quieres guardar los cambios?" antes del PUT. El reviewer pidió un fix (al tocar signo o número se limpia el texto manual viejo) más su test de UTC-5 a UTC+9. Decisión humana: aceptar, con `bun test` en 14 pass.

**Episodio 3.** README de 4 secciones y verificación manual de reinicio con servidor real: una activa y una cancelada se conservan tras el reinicio, el solape da 409 y el hueco liberado da 201. Documentado en `docs/RESTART.md`, con `bun test` en 14 pass y `data/` verificado como no versionado.

Detalle y evidencias en [DECISIONS.md](./DECISIONS.md).
