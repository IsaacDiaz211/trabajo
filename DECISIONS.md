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

## Episodio 2 — Mejora UI configuración (SATISFIES)
- Objetivo: 3 fixes básicos (zona horaria flexible, labels sin variables, modal guardar).
- Contexto: `spec.md`, `plan.md`, `public/index.html`, `src/config.ts`, imagen de la página Configuración.
- Extracto de instrucción: "corregí zona pobre → UTC±N, labels humanas, modal '¿Seguro que quieres guardar los cambios?'; devolvé RESUMEN_AGENTE; no hagas commit".

### RESUMEN_AGENTE (worker)
- `src/config.ts`: acepta IANA + UTC±N (0-14); `src/index.ts`: 400 INVALID_TIMEZONE; `public/index.html`: labels "Zona horaria / Duración máxima (horas) / Límite pasado (días) / Límite futuro (horas)", select + custom signo/número/texto UTC±N, modal `#modal-save-config` con texto exacto, PUT solo al aceptar; `tests/config.test.ts` + `tests/timezone-ui.test.ts`. `bun test` 14 pass.

### RESUMEN_REVIEWER (1ª: PARTIAL → final: SATISFIES)
- 1ª: labels PASS, modal PASS, zona PARTIAL (texto manual tenía prioridad sobre controles). Fix: limpiar texto al tocar signo/número + test UTC-5→UTC+9.
- Final: 3 fixes PASS, listeners `public/index.html:361-363` OK, test eventos `tests/timezone-ui.test.ts:60-135` OK. Sin gaps funcionales.

- Decisión humana: aceptar. Motivo: 3/3 fixes + `bun test` 14 pass verificado en harness.
- Evidencia: commit actual (`public/index.html`, `src/config.ts`, `src/index.ts`, `tests/config.test.ts`, `tests/timezone-ui.test.ts`).
- Verificación harness: `bun test → 14 pass, 0 fail, 163 expects` (Bun 1.3.12).

## Episodio 3 — README + verificación final de reinicio (SATISFIES)
- Objetivo: `README.md` con exactamente 4 secciones + verificación manual de reinicio reproducible documentada, sin secretos, `bun test` en verde, sin commit.
- Contexto suministrado al agente: `spec.md`, `plan.md`, `work_enviroment.md`, `DECISIONS.md`, `package.json`, `src/`, `tests/`.
- Extracto de instrucción: "Crear README.md con EXACTAMENTE 4 secciones (puede enlazar archivos) … Verificación manual de reinicio reproducible … No incluir secretos … Correr `bun test` y dejar en verde … Devolvé OBLIGATORIAMENTE `RESUMEN_AGENTE:` … No hagas commit".

### RESUMEN_AGENTE (episodio 3)
```
- Objetivo: dejar listo README.md + verificación final (reinicio reproducible, sin secretos, tests en verde).
- Archivos tocados (nuevos/editados, sin commit):
  - README.md (nuevo: 4 secciones ## exactas — especificación, solución, preparación del agente, registro de decisiones — con enlaces a spec/plan/work_enviroment/DECISIONS/docs-RESTART; incluye ejemplo POST 201/409 observado, rutas ./data, advertencia reset + backup futuro, admin/admin como demo documentada)
  - docs/RESTART.md (nuevo: procedimiento con DB aislada en /tmp via DB_PATH/CONFIG_PATH/PORT, comandos curl, tabla esperado vs observado, bun test 14 pass)
  - DECISIONS.md (apéndice episodio 3)
- Cómo verificar: `bun test → 14 pass, 0 fail, 163 expects`; `git check-ignore data/reservas.db data/config.json` OK (ignorados); `git ls-files` sin data/; reinicio manual: antes 2 reservas (MIC-01/active, OSC-01/cancelled) → tras reinicio mismas 2 con mismos ids, overlap 409, hueco liberado 201.
```

- Decisión humana: pendiente de revisión (diff sin commit). Evidencia: `README.md` (4x `##`), `docs/RESTART.md`, `bun test` 14 pass verificado en harness (2026-10-22, Bun 1.3.12 / pnpm 11.1.3 / OpenCode 1.16.2, sqlite 3.51.2 observada).

### RESUMEN_REVIEWER (episodio 3: PARTIAL por forma, cerrado en harness)
- README 4 secciones PASS, enlaces PASS, contenido solución PASS. Gaps: docs/RESTART paso detener sin comando explícito; reviewer sin exec (no pudo correr bun test ni git).
- Cierre en harness: `docs/RESTART.md` paso 5 ahora con `kill %1` + alternativas; `bun test → 14 pass, 0 fail, 163 expects` ejecutado; `git ls-files` sin `data/`, `git check-ignore` OK para db y config.

- Decisión humana: aceptar. Motivo: 4/4 secciones + reinicio documentado con esperado/observado + 14/14 tests + sin secretos en git.
- Evidencia: commit actual (`README.md`, `docs/RESTART.md`).
- Verificación harness: `bun test → 14 pass, 0 fail, 163 expects`; `DATA_NO_VERSIONADA_OK` + `IGNORE_OK`.
