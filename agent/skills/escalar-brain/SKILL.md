---
description: "Usa este skill para decidir si un caso/error debe escalarse al equipo Brain (plataforma core y reliability: skills, workflows, builder, canales WhatsApp/Web/FB/IG, motor de ejecución, Datum backend). Consulta patrones, mensajes de error y keywords antes de escalar un caso técnico de bot/workflow."
---

# Brain Team - Contexto específico

## Alcance del equipo

Brain es el equipo de **plataforma core y reliability** de Jelou. Responsable de:
- Infraestructura de bots (skills, workflows, flujos conversacionales)
- Integraciones de canales (WhatsApp, Web, Facebook, Instagram)
- Motor de ejecución de workflows y skills
- Builder - el editor visual donde se construyen flujos
- Datum base de datos (backend/API, estructura, columnas, IDs, sincronización, engine V2)
- Ticketera interna
- Estabilidad y disponibilidad de la plataforma

## Sistemas principales

| Sistema | Descripción |
|---------|-------------|
| **Skills** | Nodos de lógica que ejecutan acciones (HTTP, condicionales, asignaciones, IA) |
| **Workflows** | Flujos compuestos por skills que definen la lógica conversacional del bot |
| **Builder** | Editor visual donde se construyen los flujos de los bots |
| **Channels** | Integraciones con WhatsApp (Gupshup, Smooch, Wavy), Web, Facebook, Instagram |
| **Brain API** | API core que procesa mensajes entrantes y ejecuta la lógica del bot |
| **Tools core** | Infraestructura de ejecución de tools en bots. Los MCPs de Marketplace son responsabilidad del equipo Marketplace |

## Patrones comunes de issues

### 1. Skill o nodo falla
Señales: "error en el nodo", "no continua al siguiente flujo", "falla en skill X", node_id, execution_id
Datos clave: skill name/ID, node_id, execution_id, empresa, JSON del error si lo comparten

### 2. Ruteo de intenciones / NLP incorrecto
Señales: "no redirige correctamente", "skill predeterminada", "intenciones", "vectorización", score de similitud

### 3. Bug de UI en Builder o PMA
Señales: "scroll no funciona", "campos no se muestran", "el editor", "no se puede modificar", screen recordings

### 4. Bot no responde o datos incorrectos
Señales: "no responde", "respuesta incorrecta", "datos errados", "timeout"

### 5. Problema con tool/MCP
Señales: nombre de tool (ej: "search_and_send_products"), "MCP", resultados inesperados. Puede requerir coordinación con otros equipos.

### 6. Variables o memoria no funcionan
Señales: "$memory", "{{$memory.xxx}}", "variables no se pasan", template strings rotas

### 7. Campos CRM / Configuración inconsistente
Señales: "campos eliminados aparecen", "data inconsistente", "Settings vs Teams"

### 8. URLs firmadas / Privatización de archivos
Señales: "url firmada", "firma de archivos", "enlace temporal", "privatización", "desactivar"

### 9. Canal se desconecta o queda en sandbox
Señales: "ID canal:", "conexión", "sandbox", "mensajes no se registran en los logs"

### 10. Regresiones de UI en nodos (Parámetros / Guardar respuesta)
Señales: "parámetros", "Guardar respuesta como", "snake_case", "camelCase"

### 11. Límites de caracteres en AI Agent / Prompt
Señales: "5000 caracteres", "100.000 caracteres", "límite", "prompt"

### 12. Validación de URL en nodos API
Señales: "URL válida", "url compuesta", "base url dinámica"

### 13. Llamadas cíclicas entre skills
Señales: "Skill execution exceeded the limit", "skillId", "llamadas cíclicas"

### 14. Latencia de Datum / Lectura de datos desactualizados
Señales: "datos anteriores", "pausa", "trigger", "disparador". Workaround: pausa de 3 segundos antes de consultar datos recién actualizados.

### 15. Datum — carga de archivos y datos no visibles
Señales: "cargué un archivo", "no se muestran", "productos no aparecen", "historial muestra exitosa"

### 16. MCP/Marketplace — desinstalación o desconexión automática
Señales: "se desinstala automáticamente", "MCP Gmail", "MCP se desconecta"

### 17. WhatsApp Flow — no continúa después de respuesta
Señales: "WhatsApp Flow", "no continúa", "data_exchange", "endpoint_uri"

### 18. Variables de entorno — no se eliminan al desinstalar apps
Señales: "variables de entorno", "desinstalar", "Marketplace"

## Mensajes de error recurrentes

| Error | Indica |
|-------|--------|
| `Cannot read properties of undefined (reading 'reduce')` | Corrupción en tools del AI Agent |
| `We are having trouble processing your request` | Opciones de quick_reply exceden 20 caracteres |
| `Skill workflow execution exceeded the limit` / `429 Too Many Requests` | Loop en skill o rate limit |
| `Esta skill no tiene versiones` | Skill no publicada para el canal |
| `Error HTTP 504` | Timeout en operaciones de workspaces grandes |
| `WABA id is invalid or given phone is not associated with WABA` | Desalineación de credenciales Gupshup/Meta |
| `Ingresa una URL válida que inicie con http:// o https://` | URL dinámica rechazada en nodo API |
| `Skill execution exceeded the limit. {skillId: XXXX}` | Llamadas cíclicas entre skills |
| `Unprocessable entity` | MCP/Marketplace con inputs requeridos faltantes |
| `request failed contact Jelou support` | Fallo al enviar mensaje desde PMA |
| `AI_APICallError` | Fallo en descarga de imagen que cascadea a error de OpenAI |
| `Error while downloading [url]` | URL firmada bloqueada por WAF o expirada |
| `invalid peer certificate` / `Failed to search records` | SSL de MCP Odoo — certificado inválido del servidor del cliente |
| Quick reply `title` exceeds 60 chars | Título de botón WhatsApp excede límite (emojis cuentan como `:emoji_name:`) |

## Keywords de clasificación

| Keyword | Tipo de issue probable |
|---------|----------------------|
| `skill`, `intención`, `ruteo`, `derivación`, `redirige` | Ruteo de intenciones |
| `nodo AI Agent`, `agente`, `tool-call`, `reduce` | AI Agent |
| `WhatsApp Flow`, `flow`, `data_exchange` | WhatsApp Flow |
| `429`, `Too Many Requests`, `exceeded the limit` | Rate limiting / llamadas cíclicas |
| `publicar`, `versión`, `versionamiento` | Publicación/versionamiento |
| `gupshup`, `gupshup_capi`, `channelCredentials` | Credenciales de canal |
| `datum`, `filtro`, `registros`, `tabla` | Datum/datos (base de datos, backend) |
| `mcp`, `marketplace`, `tool`, `inyectando` | MCP/Marketplace (tools core; el contenido del MCP es de Marketplace) |
| `plantilla`, `campaña`, `template` | Templates de WhatsApp |
| `builder`, `canvas`, `scroll`, `modal` | UI/Builder |
| `url firmada`, `firma`, `privatización`, `enlace temporal` | URLs firmadas / seguridad de archivos |
| `sandbox`, `conexión`, `ID canal` | Canal desconectado / sandbox |
| `llamadas cíclicas`, `skillId` | Loop de skills |
| `Document Check`, `cédula`, `biometric` | Verificación biométrica → normalmente Marketplace, salvo que sea error de tool core |

## Reglas de escalación (para decidir el equipo)

- Si es problema de configuración del cliente: puede resolverlo Tech Support, no requiere Brain.
- Si no es responsabilidad de Brain (es una solicitud/feature request): no es un escalamiento de error.
- Issues de PMA (operadores, colas, chats, envío de mensajes): es de **Apps**, no Brain.
- Datum reportes (descarga Excel, exportación, formato de columnas en descargas): es de **Apps**.
- Datum base de datos (estructura, columnas, IDs, API, datos que no existen o no se exponen): **SÍ es de Brain**.
- Issues de MCPs/tools del Marketplace (Shop, biometría, pagos): es de **Marketplace**.
- Issues de canales (conexión/desconexión WhatsApp, Facebook, Instagram), skills, workflows, builder, motor de ejecución: **es de Brain**.
