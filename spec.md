# Spec: sistema de reservas de laboratorio

## 1. Objetivo
Reemplazar planilla y mensajes con un sistema local que consulte disponibilidad, reserve y cancele unidades sin perder historial. Usuario: coordinación de laboratorio. Éxito: reglas del PDF operativas y verificadas con pruebas reproducibles.

## 2. Alcance (PDF)
- Leer inventario precargado, consultar disponibilidad por unidad e intervalo. No administrar inventario.
- Crear reserva identificable: unidad + solicitante ficticio no vacío + inicio + fin.
- Cancelar conservando id y datos, liberando el intervalo.
- Persistir reservas y estados para recuperarlos al reiniciar.

Inventario inicial:
- MIC-01 Microscopio digital
- MIC-02 Microscopio digital
- OSC-01 Osciloscopio
- MUL-01 Multímetro
- FUE-01 Fuente de alimentación

Fuera de alcance: auth/roles reales, notificaciones, pagos, integraciones externas, despliegue obligatorio, GUI compleja, concurrencia distribuida, escalabilidad.

## 3. Requisitos verificables
- R1: `GET /api/units` devuelve las 5 unidades.
- R2: `GET /api/availability?unit=&from=&to=` aplica las mismas reglas de overlap que la creación.
- R3: `POST /api/reservations` crea con id único si pasa validación.
- R4: rechaza superposición de activa misma unidad (ej. MIC-01 10:00-11:00 rechaza 10:30-11:30).
- R5: permite límites consecutivos (11:00-12:00 tras 10:00-11:00) y simultáneas en distinta unidad (MIC-02 10:00-11:00 con MIC-01 ocupado).
- R6: valida unidad conocida, `requester` no vacío ni solo espacios, fechas válidas, `start < end` estricto.
- R7: `DELETE /api/reservations/:id` pasa a `cancelled`, conserva registro y libera el horario.
- R8: tras detener y reiniciar sin borrar datos, se conservan activas y canceladas.
- R9: configuración (timezone, límites) solo vía UI (`GET/PUT /api/config`).
- R10: `POST /api/admin/reset` borra reservas, conserva inventario, con modal de confirmación.

## 4. Reglas de negocio
- Activa ocupa, cancelada no bloquea.
- Overlap: `nuevo.start < existente.end && existente.start < nuevo.end`, solo contra `active` misma unidad.
- Fechas ISO 8601. Interno UTC, visualización default `America/Argentina/Buenos_Aires` (UTC-3), cambiable por UI.
- Fechas pasadas: rechazadas por defecto; override demo vía modal usuario+contraseña (campos precargados, no editables, aceptar siempre habilitado). No es seguridad real.
- Límites v1: sin límite; configurables por UI en horas/días: `maxDurationHours`, `maxPastDays`, `maxFutureHours`.
- Reset borra reservas permanentemente; modal: "Cuidado. Resetear la base de datos borrará de forma permanente ..." + "En futuras versiones se introducirá un sistema de backup."

## 5. Supuestos
- Una unidad por reserva.
- Sin autenticación real; modal demo solo muestra la funcionalidad.
- `data/reservas.db` y `data/config.json` en runtime, no versionados.
- DB con patrón Adaptador (`DbAdapter`); v1 `bun:sqlite`.
- En serverless gratis SQLite es efímero; requiere otro adaptador (D1/Postgres).

## 6. Tech stack y estructura
- Bun 1.3.12, Hono, pnpm 11.1.3, TypeScript, SQLite 3.50.6, HTML+CSS+JS vanilla. Ver `plan.md`.
- Estructura: `src/` (index, config, db/adapter, reservations, seed), `public/index.html`, `data/` runtime, `tests/`.

Comandos:
- Install: `pnpm install`
- Dev: `bun run src/index.ts`
- Test: `bun test`

## 7. Testing y aceptación
- Framework: `bun:test` en `tests/reservations.test.ts`.
- Casos obligatorios: creación válida, rechazo superposición, consecutivos, distintas unidades, entradas inválidas, cancelación que conserva y libera, persistencia tras reinicio (automática o procedimiento manual reproducible).
- Aceptación: `bun test` 6/6 en verde + verificación manual de reinicio documentada con comando y resultado.

## 8. Límites
- Siempre: validar inputs, correr tests antes de commit, revisar `git diff` con humano.
- Preguntar antes: agregar dependencias, cambiar esquema, cambiar config de deploy.
- Nunca: commitear secretos, editar `~/.config/opencode/`, borrar tests que fallan sin aprobación.

## 9. Preguntas abiertas
- Ninguna para v1. Cambios futuros se versionan en Git con motivo.
