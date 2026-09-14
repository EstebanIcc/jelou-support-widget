---
description: "Usa este skill para decidir si un caso/error debe escalarse al equipo Marketplace (productos verticales: e-commerce/Shop, biometría/Document Check, firma electrónica, pagos, HIL, WhatsApp Flows de agentes verticales, MCPs de Marketplace). Consulta patrones, mensajes de error y keywords antes de escalar."
---

# Marketplace Team - Contexto específico

## Alcance del equipo

Marketplace es el equipo de **productos verticales y agentes pre-construidos** de Jelou. Responsable de:
- Agentes de E-commerce (Jelou Shop, Webview, catálogo nativo, búsqueda de productos)
- Agentes de Biometría y verificación de identidad (Document Check, Verify, prueba de vida, Facematch)
- Agentes de Firma Electrónica (GSE, Datil)
- Agentes de Pagos (Jelou Pay, Pocket, pagos in-chat con Nuvei, Stripe, Niubiz)
- HIL (Human-in-the-Loop) - plataforma de validación humana para biometría y documentos
- WhatsApp Flows integrados en los agentes verticales
- Integraciones con proveedores externos (Facephi, RENIEC, Registro Civil, Nuvei, Stripe, Datil, Regula)
- Sincronización de productos entre tiendas externas (Shopify, WooCommerce, Meta) y Jelou Shop
- Tools y MCPs del Marketplace de Jelou

## Sistemas principales

| Sistema | Descripción |
|---------|-------------|
| **Jelou Shop** | Motor de e-commerce: gestión de productos, inventario, variantes, categorías, precios, imágenes |
| **Webview** | Vista web embebida en WhatsApp para mostrar catálogos de productos con carrito de compras |
| **Catálogo Nativo** | Catálogo integrado directamente en WhatsApp vía Meta API (sin webview) |
| **Búsqueda de Productos** | API de búsqueda semántica/hybrid/keyword sobre productos en Shop (`multi_search`) |
| **Verify / Document Check** | Agentes de verificación biométrica: captura de documento, prueba de vida (liveness), validación gubernamental |
| **Facematch** | Comparación facial contra entidades gubernamentales (RENIEC para Perú, Registro Civil para Ecuador) |
| **HIL** | Plataforma web donde operadores humanos validan/aprueban/rechazan casos de biometría y documentos |
| **Firma Electrónica** | Agentes de firma digital vía GSE (Colombia/Panamá) y Datil (Ecuador) |
| **Jelou Pay / Pocket** | Agentes de cobro y pagos in-chat. Integración con Nuvei, Stripe, Niubiz, Kushki |
| **WhatsApp Flows** | Formularios interactivos nativos de WhatsApp usados para biometría, pagos y formularios |
| **Sync de Productos** | Sincronización programada y manual entre tiendas externas y Jelou Shop |
| **Postmark** | Servicio de envío de correos transaccionales (comprobantes, notificaciones, documentos firmados) |

## Patrones comunes de issues

### 1. Productos no se muestran / búsqueda no retorna resultados
Señales: "no se muestran los productos", "búsqueda no retorna", "multi_search", "semantic", "webview vacío"

### 2. Sincronización de productos falla o requiere sync forzada
Señales: "sync", "sincronización forzada", "productos no aparecen", "catálogo desactualizado"

### 3. Token expirado o error de autenticación en API de Shop
Señales: "Unauthenticated", "token expirado", "error al cargar productos", "carga masiva"

### 4. Webview no retorna al WhatsApp o no renderiza
Señales: "webview no retorna", "no realiza el retorno", "webview no carga", "botón actualizar pedido"

### 5. Biometría - flow se cierra automáticamente
Señales: "flow se cierra", "selfie", "whatsapp flow se cierra", "iOS", "crystal-ui", "liquid glass". Issue conocido de WhatsApp/iOS, no del agente.

### 6. Biometría - prueba de vida / liveness falla
Señales: "prueba de vida", "liveness", "vivacidad", "error 500", "error de ojos cerrados"

### 7. Facematch RENIEC - configuración incorrecta
Señales: "Facematch RENIEC", "facephi", "entidad gubernamental", "datos vacíos", "RENIEC"

### 8. HIL - error 500 al aprobar/rechazar caso
Señales: "HIL", "error 500", "no permite aprobar", "no permite validar", "error en consola"

### 9. Firma electrónica - error en generación de imagen de firma
Señales: "firma electrónica", "image-canvas", "mediaUrl", "Cannot read properties of undefined"

### 10. Pagos - flujo no retorna a la conversación
Señales: "pago no retorna", "procesando", "no continuó", "webhook", "nuvei", "agente de pagos"

### 11. WhatsApp Flows - intermitencia al abrir
Señales: "flow no abre", "error al abrir flow", "intermitencia flows", "pocket"

### 12. Productos - campo obligatorio faltante al actualizar
Señales: "categories.0 field is required", "el producto no fue actualizado"

### 13. Ecommerce - botón Realizar Pedido no se habilita
Señales: "botón realizar pedido", "no se habilita", "carrito", "producto no disponible"

### 14. Búsqueda semántica retorna resultados irrelevantes
Señales: "búsqueda semántica", "resultados no relevantes"

### 15. Webview - productos sin stock visibles
Señales: "sin stock", "productos agotados", "no visible", "draft"

### 16. Pocket/Jelou Pay - comprobante de pago no llega
Señales: "comprobante no llega", "recibo de pago", "notificación de pago", "stripe"

### 17. Impuestos con valor 0 bloquean el flujo de pagos
Señales: "impuestos", "valor 0", "pagos stuck"

### 18. Sucursales - error al crear branch
Señales: "sucursal", "branch", "route could not be found"

### 19. Tool eCommerce WebView falla con error de validación
Señales: "eCommerce - Product WebView", "valores ingresados no son correctos", "E0422", "cta_url"

### 20. Biometría - datos gubernamentales vacíos o incorrectos
Señales: "datos vacíos", "nombre vacío", "información del DNI", "RENIEC", "Registro Civil"

## Mensajes de error recurrentes

| Error | Indica |
|-------|--------|
| `Unauthenticated` | Token de API expirado o inválido para la empresa |
| `The categories.0 field is required` | Campo obligatorio faltante al actualizar producto en Shop |
| `Cannot read properties of undefined (reading 'mediaUrl')` | Fallo en servicio image-canvas de firma electrónica |
| `the api is unavailable at the moment. please try again` | Servicio temporalmente no disponible (biometría/verificación) |
| `Error executing bot skill: request failed with status code 422` | Payload malformado enviado a la tool |
| `must not have additional properties` | Payload con campos extras no esperados por la API |
| `The route apps/{id}/branches could not be found` | Feature de sucursales no habilitada |
| `Los valores ingresados no son correctos` (E0422) | Validación fallida en tool eCommerce Product WebView |
| `error 500 (Internal Server Error)` en HIL | Bug del servicio HIL |
| `error de ojos cerrados` | Biometría: prueba de vivacidad falló por detección de ojos cerrados |
| `Se produjo un error. Vuelve a intentar más tarde` | Error genérico de pagos, puede ser intermitencia del proveedor |

## Keywords de clasificación

| Keyword | Tipo de issue probable |
|---------|----------------------|
| `shop`, `producto`, `catálogo`, `ecommerce`, `carrito` | E-commerce / Shop |
| `webview`, `vista web`, `catálogo webview` | Webview |
| `sync`, `sincronización` | Sincronización de productos |
| `multi_search`, `búsqueda`, `semántica`, `hybrid` | Búsqueda de productos |
| `upsert_by_sku`, `batch/products`, `carga masiva` | Carga de productos vía API |
| `biometría`, `document check`, `verify`, `liveness`, `prueba de vida` | Biometría |
| `facematch`, `reniec`, `facephi`, `registro civil` | Facematch / Validación gubernamental |
| `hil`, `human-in-the-loop`, `aprobar`, `rechazar`, `caso` | HIL |
| `firma electrónica`, `gse`, `datil`, `image-canvas`, `firmar` | Firma electrónica |
| `pago`, `pagos`, `stripe`, `nuvei`, `niubiz`, `pocket`, `jelou pay` | Pagos |
| `flow`, `whatsapp flow`, `flow se cierra` | WhatsApp Flows |
| `token`, `unauthenticated`, `expirado` | Autenticación de Shop API |
| `sucursal`, `branch` | Sucursales |
| `sku`, `variante`, `talla`, `color` | Variantes de productos |
| `postmark`, `correo`, `comprobante`, `notificación` | Correos transaccionales |
| `impuesto`, `iva`, `tax` | Configuración de impuestos |
| `stock`, `inventario`, `agotado`, `draft` | Disponibilidad de productos |

## Reglas de escalación (para decidir el equipo)

- Si el issue es de **infraestructura** (CORS, dominio, lambda, bases de datos, pipelines): no es Marketplace ni Brain directamente, es soporte de infraestructura — considera `tech_support`.
- Si el issue es de **brain/plataforma** (tool execution falla por infraestructura core, skill error, canal desconectado): es de **Brain**.
- Si el error es del **proveedor externo** (Facephi, Nuvei, Datil, RENIEC, Registro Civil): sigue siendo Marketplace (responsable de la integración).
- Si es **configuración de cliente** (token, sync horario, credenciales de Shop): Marketplace puede resolverlo directamente.
- Si involucra **WhatsApp/Meta** (crystal-ui, flow intermitente, catálogo nativo): es limitación de plataforma externa, mencionarlo mientras se escala a Marketplace igual (es su producto).
