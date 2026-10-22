# Registro de decisiones y delegación

## Episodio 1 — Implementación base + UI + tests (SATISFIES)
- Objetivo y requisito: R1-R10 de `spec.md` (API, overlap, validación ISO estricta + calendario, cancelación, persistencia, config por UI, reset con modal).
- Contexto suministrado al worker: `spec.md`, `plan.md`, `work_enviroment.md`.
- Extracto de instrucción: "implementá la base según spec/plan; luego cerrá gaps (parseIso estricto, UI vanilla, tests bun:test); devolvé bloque RESUMEN_AGENTE; no hagas commit".

### RESUMEN_AGENTE (worker, episodio base)
```
- Objetivo: implementar la base del sistema de reservas (API + persistencia + reglas) según spec.md/plan.md, sin UI ni tests.
- Archivos tocados (todos nuevos, sin commit):
  - package.json (scripts dev `bun run src/index.ts`, test `bun test`; deps hono, bun-types) + pnpm-lock.yaml generado
  - tsconfig.json (strict) y .gitignore (node_modules, data/*.db*, data/config.json)
  - src/schema.sql, src/config.ts (defaults America/Argentina/Buenos_Aires, límites null, admin demo), src/db/adapter.ts (DbAdapter), src/db/sqlite.ts (bun:sqlite, WAL+FK), src/seed.ts (5 unidades), src/reservations.ts (validación + overlap end==start permitido), src/index.ts (Hono + 7 endpoints + static)
- Cómo verificar: `pnpm install` OK; `bun run src/index.ts` OK; curl: create 201, overlap 409, consecutiva 201, requester vacío 400, pasado 400 salvo override 201, availability false/true, delete libera, PUT config persiste, reset conserva unidades, reinicio conserva reservas.
```

### RESUMEN_REVIEWER (1ª revisión: PARTIAL)
R1-R5 PASS, R7 PASS; R6 fail parcial (Date.parse no exige ISO estricto); R9 fail (sin UI config); R10 parcial (sin modal); R8 sin verificación. Fix pedido: ISO estricto, UI config, modal reset, tests + reinicio documentado.

### RESUMEN_AGENTE (worker, cierre de gaps)
```
- src/reservations.ts: regex ISO estricta; src/index.ts fix GET / (Bun.file text); public/index.html UI vanilla (unidades, crear, tabla con filtros, disponibilidad, Configuración GET/PUT, modal override readonly precargado con accept habilitado, modal reset con textos exactos + confirmación); tests/reservations.test.ts 6 tests (79 expects).
- Verificación: `bun test` 6 pass; curl smoke OK; `rm -rf ./data` limpieza.
```

### RESUMEN_REVIEWER (2ª revisión: PARTIAL)
R6 aún parcial (falta Feb 30), resto PASS. Pedido: validar calendario real + documentar reinicio manual.

### RESUMEN_AGENTE (worker, fix calendario)
- `parseIso` valida rangos y compara componentes contra Date resultante → rechaza 2026-02-30, mes 13, hora 25. Tests agregados. `bun test` 6 pass 0 fail.

### RESUMEN_REVIEWER (final: SATISFIES)
R1-R10 PASS. 6/6 tests incl. persistencia y calendario. Sin fixes de código. Pendiente documentado (no fallo): falta README + evidencia manual de reinicio (episodio aparte).

- Decisión humana: aceptar. Motivo: 10/10 requisitos en código + `bun test` 6 pass verificado en harness (88 expects, Bun 1.3.12). Correcciones aplicadas en 2 iteraciones.
- Evidencia: commit actual (`src/`, `public/index.html`, `tests/reservations.test.ts`), `bun test` 6 pass.
- Verificación harness: `bun test → 6 pass, 0 fail, 88 expects` (2026-10-22).
