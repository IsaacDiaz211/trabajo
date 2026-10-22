# Verificación manual de reinicio (R8) — procedimiento reproducible

Fecha: 2026-10-22. Versiones: Bun 1.3.12, pnpm 11.1.3, OpenCode 1.16.2, `sqlite_version()` observada 3.51.2 (plan.md declara 3.50.6).

## Procedimiento (con DB aislada en /tmp, sin tocar `./data`)

```bash
export DB_PATH=/tmp/opencode/restart-check/reservas.db CONFIG_PATH=/tmp/opencode/restart-check/config.json PORT=3457

# 1. Arranque 1
bun run src/index.ts &

# 2. Crear 1 reserva activa
curl -X POST localhost:3457/api/reservations -H 'Content-Type: application/json' \
  -d '{"unitId":"MIC-01","requester":"Ana Gómez","start":"2027-03-10T10:00:00Z","end":"2027-03-10T11:00:00Z"}'
# → 201 + id (ej. 0201fae1-d6e6-4a08-a024-4c487551e8a9)

# 3. Crear 1 reserva y cancelarla
ID_B=$(curl -s -X POST localhost:3457/api/reservations -H 'Content-Type: application/json' \
  -d '{"unitId":"OSC-01","requester":"Beto","start":"2027-03-11T10:00:00Z","end":"2027-03-11T11:00:00Z"}' \
  | bun -e "console.log((await Bun.stdin.json()).id)")
curl -X DELETE localhost:3457/api/reservations/$ID_B
# → {"status":"cancelled",...} (conserva id y datos)

# 4. Listar antes de detener → 2 reservas: MIC-01/active, OSC-01/cancelled
curl "localhost:3457/api/reservations"

# 5. Detener el primer servidor (identificar PID y matar) y arrancar de nuevo con las mismas env vars
kill %1  # mata el `bun run` del paso 11 en esta misma shell; alternativa: `pkill -f "bun run src/index.ts"` o `kill $!`
sleep 1
bun run src/index.ts &

# 6. Listar tras reinicio → deben estar las mismas 2, con mismos ids y estados
curl "localhost:3457/api/reservations"
```

## Resultado esperado vs observado (2026-10-22)

| Paso | Esperado | Observado |
|---|---|---|
| Listado antes de detener | 2 reservas: 1 `active` + 1 `cancelled` | OK: `2 reservas: MIC-01/active, OSC-01/cancelled` |
| Listado tras reinicio | Mismas 2, mismos ids/estados/datos | OK: `MIC-01/active/Ana Gómez \| OSC-01/cancelled/Beto` |
| Overlap sobre la activa conservada | `409 OVERLAP` | OK: `409` para MIC-01 10:30–11:30 |
| Hueco de la cancelada | libre → `201` al re-reservar | OK: `201` para OSC-01 10:00–11:00 |

## Tests automatizados (misma fecha)

```bash
bun test
# 14 pass, 0 fail, 163 expects (3 archivos: reservations, config, timezone-ui)
```

El caso `tests/reservations.test.ts` "persistencia tras reinicio conserva activas y canceladas" cubre R8 a nivel de adaptador (cierra y reabre el archivo); este documento cubre R8 de punta a punta con el servidor real.
