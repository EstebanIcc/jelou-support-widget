---
description: Usa este skill cuando necesites saber qué puede consultar el Analizador de Jelou, o cómo construir los args correctos antes de invocarlo.
---

# Analizador de Jelou

Herramienta interna de consulta (`analizador`) sobre el proyecto real del usuario:
conversaciones, errores, estado, proyectos, canales. Corre por debajo sobre `@jelou/cli`,
ya instalado y autenticado en tu sandbox — pero **nunca menciones "CLI", "@jelou/cli" ni
nombres de comandos técnicos al usuario**. Habla en sus términos: "voy a revisar la
conversación", "voy a analizar el estado de tu proyecto", "dejame revisar ese error".

`args` son los tokens de consulta, sin incluir la palabra `jelou` ni credenciales.

## Es de solo lectura, por diseño

El analizador tiene una allowlist de "permite por defecto-deniega": solo puede ejecutar
lo que está en la lista de abajo. Todo lo demás (crear, modificar, publicar, enviar,
borrar, login/logout) queda bloqueado automáticamente por la propia herramienta, no
depende de que tú te acuerdes de no pedirlo. Si el usuario pide algo que implica un
cambio, explícale que el analizador solo puede revisar/ver, no modificar.

## Cuándo usarlo (dispáralo con lenguaje natural)

Actívalo ante frases como "revisa la conversación", "ejecuta una revisión", "qué pasó
en...", "por qué falló...", "dime el error de...", "analiza el estado de...", o cualquier
pregunta que se refiera al bot/proyecto/canales reales del usuario — no a documentación
general (para eso sigue usando `search_jelou_docs` / `read_jelou_docs`).

Cuando el usuario describa un problema o error, ofrece proactivamente revisarlo tú mismo
con el analizador en vez de derivarlo directo a documentación o al equipo humano: pide
los datos que falten (bot id, user id/teléfono, execution id) y hazlo.

## Cómo conseguir el Bot ID (no lo confundas con el ID del proyecto)

`--bot-id` es el id de un **canal** (WhatsApp, Web, etc.), no el id del proyecto/asistente
— son campos distintos y salen de comandos distintos. Confundirlos es el error más común
al armar `logs conversations list` / `logs chat`:

- El id del proyecto sale de `project list` / `project show <id>` — identifica el AI
  assistant, **no sirve como `--bot-id`**.
- El Bot ID sale del campo `Bot.ID` de un canal puntual, listado con `channels list`.

Antes de usar `--bot-id`, seguí este orden:

1. Si no sabés a qué canal se refiere el usuario (o hay más de uno), listá los canales
   con `analizador({ args: ["channels", "list"] })`, o preguntale directamente cuál canal
   es (WhatsApp, Web, etc.) si no quedó claro.
2. De esa respuesta, tomá el campo `Bot.ID` **del canal correspondiente** — no otro campo
   del mismo canal, y nunca el id de `project list`/`project show`.
3. Usá ese valor, y solo ese, como `--bot-id` en `logs conversations list` o `logs chat`.

## Regla de oro: confirma sintaxis con `--describe`

Antes de un subcomando que no hayas usado en esta conversación, o si no estás seguro de
sus flags exactos, confírmalo con la introspección nativa:

- `analizador({ args: ["--describe"] })` — árbol completo
- `analizador({ args: ["logs", "chat", "--describe"] })` — schema de un comando puntual

## Lo que SÍ puede consultar

| Consulta | Para qué sirve |
| --- | --- |
| `whoami` | Identidad activa. Útil para diagnosticar problemas de acceso (nunca intentes `login`/`logout`). |
| `doctor` | Diagnóstico general: API, auth, perfil, lockfile, proyecto, versión. |
| `status` | Drift entre archivos locales, lockfile y servidor. |
| `link --status` | Ver el binding actual del proyecto (sin cambiar nada; requiere el flag `--status`). |
| `logs conversations list --bot-id <id>` | Lista conversaciones de producción (usuario × día) en un rango de fechas. |
| `logs chat --bot-id <id> --user-id <phone>` | Timeline completo de un usuario: mensajes + ejecuciones. Usa `--failed-only` para ver solo lo que falló. |
| `logs node --execution-id <id> --node-id <id>` | Detalle de un nodo puntual (config, estado inicial/final) tras ver un FAILED en `logs chat`. |
| `project list` / `project show <id>` | Lista o detalla proyectos (AI assistants). |
| `channels list` | Lista canales de mensajería y sus ids (necesarios como `--bot-id`). |
| `test trace <execution-id>` | Traza nodo por nodo de una ejecución de prueba grabada. |
| `test turn status <execution-id>` | Seguir un turno de prueba en curso. |
| `test chats list` / `test chats show <execution-id>` | Conversaciones de prueba grabadas. |
| `test grep <query>` | Búsqueda de texto en mensajes de prueba. |
| `metrics` | Métricas de analytics (usuarios activos, sesiones, mensajería). |
| `models` | Modelos de IA disponibles para nodos AI_TASK / AI Agent. |
| `connect` | Operadores y equipos de human-handoff. |
| `changelog` / `update` | Versión del sistema e info de actualización (solo reporta, no actualiza). |

## Lo que NO puede hacer (bloqueado, no lo intentes)

`login`, `logout`, `auth`, `secret`, `profiles` (autenticación — ya está resuelta por el
sistema), `push`, `pull`, `incoming`, `workflow`, `functions`, `databases`/`datum`,
`marketplace`, `campaign`, `template`, `shop`, `voice`, `users`, `feedback`, `project
create/update/delete/publish`, `channels` más allá de `list`, `test send`, y `link` sin
`--status`. Si el usuario necesita alguna de estas acciones, explícale que el analizador
no puede modificar nada y que esa acción hay que hacerla desde la plataforma de Jelou o
con el equipo humano.
