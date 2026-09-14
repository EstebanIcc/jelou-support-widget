---
description: "Usa este skill para decidir si un caso/error debe escalarse al equipo Apps (producto frontend y experiencia de usuario: PMA/operadores, campañas HSM, reportes, roles/permisos, CRM, métricas, configuración de company, Datum reportes). Consulta patrones, mensajes de error y keywords antes de escalar."
---

# Apps Team - Contexto específico

## Alcance del equipo

Apps es el equipo de **producto frontend y experiencia de usuario** de Jelou. Responsable de:
- PMA (Plataforma de Manejo de Agentes) - el panel donde los operadores humanos atienden conversaciones
- Módulo de Campañas y HSM - envío masivo de plantillas WhatsApp
- Módulo de Métricas y Monitoreo - dashboards de analytics y monitoreo en tiempo real
- Módulo de Reportes - generación y descarga de reportes (BIC, PMP, conversaciones)
- Módulo de Clientes/CRM - gestión de contactos y campos personalizados
- Datum reportes (descarga Excel, exportación, formato de columnas en descargas, interfaz de consulta)
- Administración de usuarios - roles, permisos, invitaciones, contraseñas
- Configuración de companies - planes, subcompañías

## Sistemas principales

| Sistema | Descripción |
|---------|-------------|
| **PMA** | Panel web donde operadores atienden conversaciones transferidas por el bot |
| **Campañas/HSM** | Módulo para crear plantillas WhatsApp, enviar campañas masivas y ver reportes de envío |
| **Métricas/Monitoreo** | Dashboards de analytics y monitoreo en tiempo real de operadores conectados |
| **Reportes** | Generación y descarga de reportes en CSV/XLSX (BIC PMP, conversaciones, campañas) |
| **Clientes/CRM** | Gestión de contactos, historial de conversaciones, campos personalizados |
| **Datum (reportes)** | Descarga Excel, exportación de datos, formato de columnas en descargas. La base de datos en sí (estructura, columnas, IDs, API) es de Brain |
| **Admin/Usuarios** | Gestión de roles, permisos, invitaciones, contraseñas, impersonación |
| **Configuración Company** | Planes (Self-Service, Enterprise, Demo), subcompañías, activación de módulos |

## Patrones comunes de issues

### 1. PMA - Conversaciones no se asignan o no se visualizan
Señales: "no visualiza", "no aparecen", "pendientes", "no le llegan chats", "no se asignan", "cola de atención"

### 2. PMA - Operador siempre conectado / no se desconecta
Señales: "siempre conectado", "siempre disponible", "no se desconecta", "monitoreo muestra conectado"

### 3. PMA - Discrepancia entre monitoreo y PMA
Señales: "monitoreo muestra X pero PMA muestra Y", "chats activos no coinciden", "conteo diferente"

### 4. PMA - Lentitud de la plataforma
Señales: "lentitud", "lento", "se queda cargando", "tarda mucho"

### 5. HSM/Campañas - Error al enviar campaña
Señales: "error al enviar campaña", "campaña no se envía", "no se reciben los mensajes"

### 6. HSM/Campañas - Plantilla en estado "Fallida"
Señales: "estado fallida", "plantilla fallida", "no se aprueba", "rechazada", "rejectedReason"

### 7. HSM/Campañas - Reporte de campañas no disponible
Señales: "reporte de campañas", "no me deja ingresar", "error al acceder a reportes"

### 8. Roles/Permisos - No se puede asignar permiso o rol
Señales: "no es posible asignar", "permiso", "rol", "acceso", "subcompañía impide"

### 9. Roles/Permisos - Invitación expira prematuramente
Señales: "invitación expirada", "expiración", "se siguen expirando"

### 10. Roles/Permisos - Contraseña expirada / No llega código
Señales: "contraseña caducó", "no llega el código", "recuperar contraseña", "Postmark"

### 11. Reportes - No se puede descargar o generar reporte
Señales: "no se puede descargar", "reporte no carga", "error al descargar", "reporte vacío", "BIC PMP"

### 12. CRM - Información no se muestra o no se actualiza en PMA
Señales: "CRM no se muestra", "campos no aparecen", "información no se actualiza"

### 13. Monitoreo/Métricas - Datos no disponibles o incorrectos
Señales: "métricas no muestran", "no se visualiza el viaje del usuario"

### 14. Company - Configuración incorrecta (plan, demo, subcompañía)
Señales: "company creada como demo", "plan incorrecto", "unificar companies", "subcompañía"

### 15. PMA - Error al responder publicaciones (Facebook/Instagram)
Señales: "publicaciones", "error al responder", "Estamos teniendo problemas procesando la solicitud", "token"

### 16. API - Error "We are having trouble processing your request"
Señales: "We are having trouble", "trouble processing", "failed", "statusMessage: failed"

### 17. PMA - Zona horaria incorrecta en registros
Señales: "zona horaria", "UTC", "horario incorrecto"

## Regla de decisión Datum: Brain vs Apps

- El dato **no existe o no se expone** por el backend → **Brain** (estructura de base de datos)
- El dato **existe pero no se muestra** en la descarga/reporte → **Apps** (formato de exportación)
- Error 502 o API de Datum caída → **Brain** (backend)
- Interfaz de consulta no carga o error de UI → **Apps** (frontend)

## Mensajes de error recurrentes

| Error | Indica |
|-------|--------|
| `We are having trouble processing your request` | Formato incorrecto en envío de mensaje o error de API |
| `Estamos teniendo problemas procesando la solicitud` | También aparece al responder publicaciones con token expirado |
| `Error al enviar campaña` | Plantilla no aprobada, parámetros incorrectos, o botId inválido |
| `rejectedReason` en plantillas | La plantilla viola reglas de Meta |
| `502 Bad Gateway` | Servicio de backend caído (ej: Datum v2 API) — escalar a Brain |
| `Error HTTP 500` | Error interno del servidor |
| `request failed contact Jelou support` | Fallo genérico al enviar mensaje desde PMA |

## Keywords de clasificación

| Keyword | Tipo de issue probable |
|---------|----------------------|
| `pma`, `operador`, `asesor`, `cola`, `derivación` | PMA / Operadores |
| `campaña`, `hsm`, `plantilla`, `template`, `difusión` | HSM / Campañas |
| `reporte`, `descargar`, `exportar`, `csv`, `xlsx` | Reportes / Descargas |
| `monitoreo`, `métricas`, `analytics`, `dashboard` | Métricas / Monitoreo |
| `rol`, `permiso`, `acceso`, `invitación`, `contraseña` | Roles / Permisos |
| `crm`, `contacto`, `campo` | CRM / Contactos |
| `datum`, `base de datos` (frontend/descarga) | Datum (ver regla Brain vs Apps arriba) |
| `company`, `plan`, `subcompañía`, `demo`, `enterprise` | Configuración de Company |
| `canal`, `whatsapp`, `facebook`, `instagram` (conexión) | Redirigir a **Brain** |
| `publicaciones`, `responder publicación` | Redes sociales (PMA) |
| `api`, `curl`, `endpoint`, `cta` | API / Integraciones |
| `postmark`, `código`, `correo` | Autenticación / Correo |
| `zona horaria`, `utc` | Configuración de timezone |

## Reglas de escalación (para decidir el equipo)

- PMA, campañas/HSM, reportes, roles/permisos, CRM, métricas, configuración de company: **Apps**.
- Bot/Skills/Workflows/Builder: **Brain**.
- Shop/tienda, JelouPay, pagos, catálogo, webview, e-commerce: **Marketplace**.
- Canales (conexión/desconexión WhatsApp, Facebook, Instagram): **Brain**.
- Infraestructura (AWS, bases de datos, timeouts de DB, pipelines) o acceso a herramientas/API keys/hardware de terceros: no es de producto — usar `tech_support`.
