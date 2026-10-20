# Entorno de trabajo del agente

## 1. Harness
- Nombre: OpenCode
- Versión: 1.16.2 (`opencode --version`)
- Modo: `build`
- Rol: coordina modelo, herramientas, contexto y ejecución sobre el repositorio con herramientas reales. No se construye un harness propio.

## 2. Proveedor y modelos
- Proveedor principal: `opencode-go` (modelos `opencode-go/*` usados por los subagentes).
- Configuración: `~/.config/opencode/opencode.json` — **configuración global, externa al repositorio**. No hay `opencode.json` local en `trabajo/`.
- Modelos declarados en esa configuración global (campo `agent[].model`):
  - `general`: `opencode-go/muse-spark-1.3-contributor`
  - `worker`: `opencode-go/muse-spark-1.3-contributor`
  - `worker-escalation`: `opencode-go/gemini-4-argon-contributor`
  - `code-reviewer`: `opencode-go/gpt-6-luna`
  - `code-reviewer-escalation`: `opencode-go/mimo-v2.6-pro`
  - `scout`: `inception/mercury-2.5`
  - `explore`: `fireworks-ai/accounts/fireworks/models/glm-5p3-flash`
- Agente principal de esta sesión: `opencode-go/muse-spark-1.3-contributor` (coincide con `general`/`worker` de la config global).
- Función: agente de programación que actúa sobre el repo (leer, editar, ejecutar, verificar).
- Motivo de elección: según inteligencia y costo. Para modelos escalition se ocupan modelos más potentes pero como son más caros solo como último recurso. Para explore y scout se priorizaron modelos rápidos y no muy inteligentes. Para worker y general se eligió el modelo más inteligente a menor costo que se puede acceder actualmente para mi suscripción.

Extracto saneado de la configuración global (cómo se aplicó: se reutiliza tal cual, sin copiarla al repo):
```json
{
  "agent": {
    "general": { "mode": "subagent", "model": "opencode-go/muse-spark-1.3-contributor" },
    "worker": { "mode": "subagent", "model": "opencode-go/muse-spark-1.3-contributor" },
    "scout": { "mode": "subagent", "model": "inception/mercury-2.5" },
    "explore": { "mode": "subagent", "model": "fireworks-ai/accounts/fireworks/models/glm-5p3-flash" }
  }
}
```

## 3. Contexto suministrado
- Incluido: `challenge-agents.pdf` (consigna, 3 páginas: alcance, reglas, inventario de 5 unidades, verificaciones, rúbrica).
- Excluido: resto del filesystem fuera de `trabajo/`, historial de chats privados, credenciales, datos reales de estudiantes.
- Directorio de trabajo: `/home/isaac/Documentos/LSI/Topicos/trabajo` (+ `/tmp/opencode` solo para temporales).

## 4. Herramientas y permisos
Acceso real del agente en esta sesión:
- `bash` — comandos de terminal (git, python, pytest, etc.)
- `read` / `write` / `edit` — leer, crear y editar archivos del repo
- `glob` / `grep` — buscar archivos y contenido
- `task` — lanzar subagentes (`general`, `worker`, `explore`, `scout`, `code-reviewer`)
- `todowrite` — lista de tareas de la sesión
- `skill` — cargar skills (ej. `spec-driven-development`)
- `webfetch` / `websearch` — contenido web y documentación
- `context7_*` + MCP `context7`/`nac` — documentación actualizada de librerías
- `question` — pedir decisión al humano

Limitaciones:
- Solo operar dentro de la carpeta del proyecto (`trabajo/`). No leer ni modificar la configuración global ni otros directorios.
- No incluye secretos, tokens ni credenciales en el repo.
- Cambios se revisan con `git status` / `git diff` antes de aceptar/commit. La aprobación humana es manual antes de cada commit y antes de dar por válido un resultado.

## 5. Retención del progreso
- Progreso y decisiones se conservan en archivos versionados en el repo (este archivo + `DECISIONS.md` / `README.md` cuando se creen).
- No se exige reiniciar sesiones ni provocar fallas.
