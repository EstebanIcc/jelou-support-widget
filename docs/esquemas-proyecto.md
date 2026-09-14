# Esquemas del proyecto — jelou-eve-agent

## 1. Diagrama de arquitectura

Jelou apps embebe el widget. El widget corre en el navegador y habla con Eve Agent (Next.js + eve framework), que a su vez llama a OpenAI para el modelo, a Docs MCP para documentación, a los servicios internos de Jelou para usuario/company/api-key del CLI, y a Slack para escalamientos.

Colores: gris = componente externo/neutral (fuera del control de Jelou), teal = stack propio de Jelou, coral = proveedor externo que se integra (OpenAI, Slack).

<svg width="100%" viewBox="0 0 680 600" xmlns="http://www.w3.org/2000/svg" role="img">
<title>Arquitectura de jelou-eve-agent</title>
<desc>Jelou apps embebe el widget. El widget corre en el navegador y habla con Eve Agent (Next.js + eve framework), que a su vez llama a OpenAI para el modelo, a Docs MCP para documentación, a los servicios internos de Jelou para usuario/company/api-key del CLI, y a Slack para escalamientos.</desc>
<defs>
<marker id="arrow1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#73726c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>
</defs>
<style>
  .t1{font-family:sans-serif;fill:#3d3d3a}
  .th1{font-family:sans-serif;font-weight:600;font-size:14px;fill:#1f1f1d}
  .ts1{font-family:sans-serif;font-size:12px;fill:#5c5b56}
  .box1{fill:#F1EFE8;stroke:#888780;stroke-width:0.5}
  .teal1{fill:#E1F5EE;stroke:#0F6E56;stroke-width:0.5}
  .teal1 .th1{fill:#085041}
  .teal1 .ts1{fill:#0F6E56}
  .coral1{fill:#FAECE7;stroke:#993C1D;stroke-width:0.5}
  .coral1 .th1{fill:#712B13}
  .coral1 .ts1{fill:#993C1D}
  .arr1{stroke:#73726c;stroke-width:1.5;fill:none}
</style>

<line x1="340" y1="96" x2="340" y2="156" class="arr1" marker-end="url(#arrow1)"/>
<line x1="340" y1="212" x2="340" y2="272" class="arr1" marker-end="url(#arrow1)"/>
<line x1="340" y1="328" x2="195" y2="388" class="arr1" marker-end="url(#arrow1)"/>
<line x1="340" y1="328" x2="485" y2="388" class="arr1" marker-end="url(#arrow1)"/>
<path d="M340,328 L340,470 L195,470 L195,504" class="arr1" marker-end="url(#arrow1)"/>
<path d="M340,328 L340,470 L485,470 L485,504" class="arr1" marker-end="url(#arrow1)"/>

<g class="box1">
  <rect x="190" y="40" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="58" text-anchor="middle" dominant-baseline="central">Jelou apps</text>
  <text class="ts1" x="340" y="78" text-anchor="middle" dominant-baseline="central">Embebe el widget (iframe)</text>
</g>

<g class="teal1">
  <rect x="190" y="156" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="174" text-anchor="middle" dominant-baseline="central">Widget (ChatWidget)</text>
  <text class="ts1" x="340" y="194" text-anchor="middle" dominant-baseline="central">Next.js, corre en el navegador</text>
</g>

<g class="teal1">
  <rect x="190" y="272" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="290" text-anchor="middle" dominant-baseline="central">Eve Agent</text>
  <text class="ts1" x="340" y="310" text-anchor="middle" dominant-baseline="central">Modelo, tools e instructions</text>
</g>

<g class="coral1">
  <rect x="60" y="388" width="270" height="56" rx="8"/>
  <text class="th1" x="195" y="406" text-anchor="middle" dominant-baseline="central">OpenAI</text>
  <text class="ts1" x="195" y="426" text-anchor="middle" dominant-baseline="central">GPT-5.6 Luna</text>
</g>

<g class="teal1">
  <rect x="350" y="388" width="270" height="56" rx="8"/>
  <text class="th1" x="485" y="406" text-anchor="middle" dominant-baseline="central">Docs MCP</text>
  <text class="ts1" x="485" y="426" text-anchor="middle" dominant-baseline="central">Documentación de Jelou</text>
</g>

<g class="teal1">
  <rect x="60" y="504" width="270" height="56" rx="8"/>
  <text class="th1" x="195" y="522" text-anchor="middle" dominant-baseline="central">Servicios Jelou</text>
  <text class="ts1" x="195" y="542" text-anchor="middle" dominant-baseline="central">Usuario, company, api-key CLI</text>
</g>

<g class="coral1">
  <rect x="350" y="504" width="270" height="56" rx="8"/>
  <text class="th1" x="485" y="522" text-anchor="middle" dominant-baseline="central">Slack</text>
  <text class="ts1" x="485" y="542" text-anchor="middle" dominant-baseline="central">Escalamientos a equipos</text>
</g>
</svg>

---

## 2. Proceso: identificación de usuario y company

El widget carga con el email del visitante y lo manda como header. Eve Agent consulta el gateway de Jelou. Si resuelve una company, la guarda en la sesión y el modelo ya sabe quién es sin preguntar. Si no, la sesión sigue anónima. En ambos casos el chat funciona.

<svg width="100%" viewBox="0 0 680 576" xmlns="http://www.w3.org/2000/svg" role="img">
<title>Proceso de identificación de usuario y company</title>
<desc>El widget carga con el email del visitante y lo manda como header. Eve Agent consulta el gateway de Jelou. Si resuelve una company, la guarda en la sesión. Si no, la sesión sigue anónima.</desc>
<defs>
<marker id="arrow2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#73726c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>
</defs>
<style>
  .th1{font-family:sans-serif;font-weight:600;font-size:14px;fill:#1f1f1d}
  .ts1{font-family:sans-serif;font-size:12px;fill:#5c5b56}
  .box1{fill:#F1EFE8;stroke:#888780;stroke-width:0.5}
  .teal1{fill:#E1F5EE;stroke:#0F6E56;stroke-width:0.5}
  .teal1 .th1{fill:#085041}
  .teal1 .ts1{fill:#0F6E56}
  .arr1{stroke:#73726c;stroke-width:1.5;fill:none}
</style>

<line x1="340" y1="84" x2="340" y2="144" class="arr1" marker-end="url(#arrow2)"/>
<line x1="340" y1="200" x2="340" y2="260" class="arr1" marker-end="url(#arrow2)"/>
<line x1="340" y1="316" x2="190" y2="376" class="arr1" marker-end="url(#arrow2)"/>
<line x1="340" y1="316" x2="490" y2="376" class="arr1" marker-end="url(#arrow2)"/>
<line x1="190" y1="432" x2="340" y2="492" class="arr1" marker-end="url(#arrow2)"/>
<line x1="490" y1="432" x2="340" y2="492" class="arr1" marker-end="url(#arrow2)"/>

<text class="ts1" x="300" y="324" text-anchor="end">Sí</text>
<text class="ts1" x="380" y="324" text-anchor="start">No</text>

<g class="box1">
  <rect x="190" y="40" width="300" height="44" rx="8"/>
  <text class="th1" x="340" y="62" text-anchor="middle" dominant-baseline="central">Inicio</text>
</g>

<g class="teal1">
  <rect x="190" y="144" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="162" text-anchor="middle" dominant-baseline="central">Widget carga con email</text>
  <text class="ts1" x="340" y="182" text-anchor="middle" dominant-baseline="central">Envía x-jelou-user-email</text>
</g>

<g class="box1">
  <rect x="190" y="260" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="278" text-anchor="middle" dominant-baseline="central">¿Se resolvió company?</text>
  <text class="ts1" x="340" y="298" text-anchor="middle" dominant-baseline="central">Vía Jelou Gateway</text>
</g>

<g class="teal1">
  <rect x="50" y="376" width="280" height="56" rx="8"/>
  <text class="th1" x="190" y="394" text-anchor="middle" dominant-baseline="central">Company resuelta</text>
  <text class="ts1" x="190" y="414" text-anchor="middle" dominant-baseline="central">Se guarda en la sesión</text>
</g>

<g class="box1">
  <rect x="350" y="376" width="280" height="56" rx="8"/>
  <text class="th1" x="490" y="394" text-anchor="middle" dominant-baseline="central">Sin company</text>
  <text class="ts1" x="490" y="414" text-anchor="middle" dominant-baseline="central">Sesión sigue anónima</text>
</g>

<g class="box1">
  <rect x="190" y="492" width="300" height="44" rx="8"/>
  <text class="th1" x="340" y="514" text-anchor="middle" dominant-baseline="central">Fin</text>
</g>
</svg>

---

## 3. Proceso: escalamiento a Slack con pausa y reanudación

El agente arma el mensaje y lo publica en Slack; la sesión queda pausada esperando respuesta del equipo. Cuando el equipo responde, se llama a `/api/escalations/respond` con el sessionId, lo que reanuda la sesión. Si el widget sigue abierto se ve al instante; si no, el watcher de reconexión lo detecta al reabrir.

<svg width="100%" viewBox="0 0 680 1040" xmlns="http://www.w3.org/2000/svg" role="img">
<title>Proceso de escalamiento a Slack con pausa y reanudación</title>
<desc>El agente arma el mensaje y lo publica en Slack, la sesión queda pausada esperando respuesta del equipo. Cuando el equipo responde, se llama a /api/escalations/respond con el sessionId, lo que reanuda la sesión.</desc>
<defs>
<marker id="arrow3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#73726c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>
</defs>
<style>
  .th1{font-family:sans-serif;font-weight:600;font-size:14px;fill:#1f1f1d}
  .ts1{font-family:sans-serif;font-size:12px;fill:#5c5b56}
  .box1{fill:#F1EFE8;stroke:#888780;stroke-width:0.5}
  .teal1{fill:#E1F5EE;stroke:#0F6E56;stroke-width:0.5}
  .teal1 .th1{fill:#085041}
  .teal1 .ts1{fill:#0F6E56}
  .coral1{fill:#FAECE7;stroke:#993C1D;stroke-width:0.5}
  .coral1 .th1{fill:#712B13}
  .coral1 .ts1{fill:#993C1D}
  .arr1{stroke:#73726c;stroke-width:1.5;fill:none}
</style>

<line x1="340" y1="84" x2="340" y2="144" class="arr1" marker-end="url(#arrow3)"/>
<line x1="340" y1="200" x2="340" y2="260" class="arr1" marker-end="url(#arrow3)"/>
<line x1="340" y1="316" x2="340" y2="376" class="arr1" marker-end="url(#arrow3)"/>
<line x1="340" y1="432" x2="340" y2="492" class="arr1" marker-end="url(#arrow3)"/>
<line x1="340" y1="548" x2="340" y2="608" class="arr1" marker-end="url(#arrow3)"/>
<line x1="340" y1="664" x2="340" y2="724" class="arr1" marker-end="url(#arrow3)"/>
<line x1="340" y1="780" x2="190" y2="840" class="arr1" marker-end="url(#arrow3)"/>
<line x1="340" y1="780" x2="490" y2="840" class="arr1" marker-end="url(#arrow3)"/>
<line x1="190" y1="896" x2="340" y2="956" class="arr1" marker-end="url(#arrow3)"/>
<line x1="490" y1="896" x2="340" y2="956" class="arr1" marker-end="url(#arrow3)"/>

<text class="ts1" x="300" y="788" text-anchor="end">Sí</text>
<text class="ts1" x="380" y="788" text-anchor="start">No</text>

<g class="box1">
  <rect x="190" y="40" width="300" height="44" rx="8"/>
  <text class="th1" x="340" y="62" text-anchor="middle" dominant-baseline="central">El agente decide escalar</text>
</g>

<g class="teal1">
  <rect x="190" y="144" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="162" text-anchor="middle" dominant-baseline="central">Arma el mensaje</text>
  <text class="ts1" x="340" y="182" text-anchor="middle" dominant-baseline="central">Canal=Widget, company de sesión</text>
</g>

<g class="coral1">
  <rect x="190" y="260" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="278" text-anchor="middle" dominant-baseline="central">Publica en Slack</text>
  <text class="ts1" x="340" y="298" text-anchor="middle" dominant-baseline="central">POST a slack-service</text>
</g>

<g class="box1">
  <rect x="190" y="376" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="394" text-anchor="middle" dominant-baseline="central">Sesión queda pausada</text>
  <text class="ts1" x="340" y="414" text-anchor="middle" dominant-baseline="central">Espera respuesta del equipo</text>
</g>

<g class="coral1">
  <rect x="190" y="492" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="510" text-anchor="middle" dominant-baseline="central">Equipo responde en Slack</text>
  <text class="ts1" x="340" y="530" text-anchor="middle" dominant-baseline="central">Fuera del control del agente</text>
</g>

<g class="teal1">
  <rect x="190" y="608" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="626" text-anchor="middle" dominant-baseline="central">POST /api/escalations/respond</text>
  <text class="ts1" x="340" y="646" text-anchor="middle" dominant-baseline="central">Con el sessionId</text>
</g>

<g class="box1">
  <rect x="190" y="724" width="300" height="56" rx="8"/>
  <text class="th1" x="340" y="742" text-anchor="middle" dominant-baseline="central">¿Widget sigue abierto?</text>
  <text class="ts1" x="340" y="762" text-anchor="middle" dominant-baseline="central">En el mismo navegador</text>
</g>

<g class="teal1">
  <rect x="50" y="840" width="280" height="56" rx="8"/>
  <text class="th1" x="190" y="858" text-anchor="middle" dominant-baseline="central">Respuesta al instante</text>
  <text class="ts1" x="190" y="878" text-anchor="middle" dominant-baseline="central">Mismo tab, sin recargar</text>
</g>

<g class="teal1">
  <rect x="350" y="840" width="280" height="56" rx="8"/>
  <text class="th1" x="490" y="858" text-anchor="middle" dominant-baseline="central">Lo detecta el watcher</text>
  <text class="ts1" x="490" y="878" text-anchor="middle" dominant-baseline="central">Al reabrir, vía localStorage</text>
</g>

<g class="box1">
  <rect x="190" y="956" width="300" height="44" rx="8"/>
  <text class="th1" x="340" y="978" text-anchor="middle" dominant-baseline="central">Fin</text>
</g>
</svg>

---

## 4. Secuencia técnica: analizador con api-key dinámico

Al iniciar sesión, Widget manda el email a Eve Agent, que pide companyId y sessionId a Jelou API y recibe un apiKey, con el que loguea el CLI en el sandbox. Después, cuando el usuario pregunta algo que dispara el analizador, Eve Agent ejecuta el comando en el sandbox y devuelve la respuesta al widget.

<svg width="100%" viewBox="0 0 680 540" xmlns="http://www.w3.org/2000/svg" role="img">
<title>Secuencia técnica del analizador con api-key dinámico</title>
<desc>Widget manda el email a Eve Agent, que pide companyId y sessionId a Jelou API y recibe un apiKey, con el que loguea el CLI en el sandbox. Luego ejecuta el comando del analizador y devuelve la respuesta.</desc>
<defs>
<marker id="arrow4" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#73726c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>
</defs>
<style>
  .th1{font-family:sans-serif;font-weight:600;font-size:14px;fill:#1f1f1d}
  .ts1{font-family:sans-serif;font-size:12px;fill:#5c5b56}
  .box1{fill:#F1EFE8;stroke:#888780;stroke-width:0.5}
  .teal1{fill:#E1F5EE;stroke:#0F6E56;stroke-width:0.5}
  .teal1 .th1{fill:#085041}
  .coral1{fill:#FAECE7;stroke:#993C1D;stroke-width:0.5}
  .coral1 .th1{fill:#712B13}
  .arr1{stroke:#73726c;stroke-width:1.5;fill:none}
  .leader1{stroke:#b0b0a8;stroke-width:0.5;stroke-dasharray:3 3;fill:none}
</style>

<line x1="70" y1="52" x2="70" y2="510" class="leader1"/>
<line x1="205" y1="52" x2="205" y2="510" class="leader1"/>
<line x1="340" y1="52" x2="340" y2="510" class="leader1"/>
<line x1="475" y1="52" x2="475" y2="510" class="leader1"/>
<line x1="610" y1="52" x2="610" y2="510" class="leader1"/>

<line x1="205" y1="90" x2="340" y2="90" class="arr1" marker-end="url(#arrow4)"/>
<text class="ts1" x="272" y="84" text-anchor="middle">Header con email</text>

<line x1="340" y1="134" x2="475" y2="134" class="arr1" marker-end="url(#arrow4)"/>
<text class="ts1" x="407" y="128" text-anchor="middle">companyId + sessionId</text>

<line x1="475" y1="178" x2="340" y2="178" class="arr1" marker-end="url(#arrow4)"/>
<text class="ts1" x="407" y="172" text-anchor="middle">apiKey</text>

<line x1="340" y1="222" x2="610" y2="222" class="arr1" marker-end="url(#arrow4)"/>
<text class="ts1" x="475" y="216" text-anchor="middle">jelou login</text>

<line x1="70" y1="266" x2="205" y2="266" class="arr1" marker-end="url(#arrow4)"/>
<text class="ts1" x="137" y="260" text-anchor="middle">Pregunta sobre su bot</text>

<line x1="205" y1="310" x2="340" y2="310" class="arr1" marker-end="url(#arrow4)"/>
<text class="ts1" x="272" y="304" text-anchor="middle">send message</text>

<line x1="340" y1="354" x2="610" y2="354" class="arr1" marker-end="url(#arrow4)"/>
<text class="ts1" x="475" y="348" text-anchor="middle">jelou --agent</text>

<line x1="610" y1="398" x2="340" y2="398" class="arr1" marker-end="url(#arrow4)"/>
<text class="ts1" x="475" y="392" text-anchor="middle">stdout</text>

<line x1="340" y1="442" x2="205" y2="442" class="arr1" marker-end="url(#arrow4)"/>
<text class="ts1" x="272" y="436" text-anchor="middle">Respuesta</text>

<line x1="205" y1="486" x2="70" y2="486" class="arr1" marker-end="url(#arrow4)"/>
<text class="ts1" x="137" y="480" text-anchor="middle">Muestra respuesta</text>

<g class="box1">
  <rect x="5" y="20" width="130" height="32" rx="6"/>
  <text class="th1" x="70" y="36" text-anchor="middle" dominant-baseline="central">Usuario</text>
</g>
<g class="teal1">
  <rect x="140" y="20" width="130" height="32" rx="6"/>
  <text class="th1" x="205" y="36" text-anchor="middle" dominant-baseline="central">Widget</text>
</g>
<g class="teal1">
  <rect x="275" y="20" width="130" height="32" rx="6"/>
  <text class="th1" x="340" y="36" text-anchor="middle" dominant-baseline="central">Eve Agent</text>
</g>
<g class="teal1">
  <rect x="410" y="20" width="130" height="32" rx="6"/>
  <text class="th1" x="475" y="36" text-anchor="middle" dominant-baseline="central">Jelou API</text>
</g>
<g class="coral1">
  <rect x="545" y="20" width="130" height="32" rx="6"/>
  <text class="th1" x="610" y="36" text-anchor="middle" dominant-baseline="central">Sandbox</text>
</g>
</svg>

---

## 5. Matriz de herramientas y tecnologías

| Categoría | Herramienta | Uso |
|---|---|---|
| Lenguaje | TypeScript | Todo el proyecto (frontend + agente) |
| Framework web | Next.js 16 (App Router) | Sirve el widget y las páginas de prueba |
| Runtime del agente | eve framework | Modelo, tools, instructions, sandbox, auth de sesión |
| Modelo | OpenAI GPT-5.6 Luna (`@ai-sdk/openai`) | Genera las respuestas del agente |
| UI | Tailwind CSS + shadcn/ui | Estilos y componentes del widget |
| Streaming/Markdown | Streamdown | Reveal gradual y render de Markdown en las respuestas |
| Validación | Zod | Input/output schemas de las tools (`escalar`, `analizador`) |
| Persistencia cliente | localStorage | Historial de chat con TTL de 24h |
| Identidad de usuario | Jelou Gateway (`/platform/v1/utils/users`) | Resuelve email → usuario + company |
| Api-key dinámico del CLI | `support-widget-service.fn.jelou.ai` | Devuelve (o crea) el api-key por company |
| CLI | `@jelou/cli` | Ejecutado por la tool "analizador" (solo lectura) |
| Sandbox | Vercel Sandbox (`eve/sandbox`) | Entorno aislado donde corre el CLI |
| Escalamientos | Servicio de Slack (`slack-service-two.vercel.app`) | Publica mensajes y permite reanudar sesiones pausadas |
| Hosting / despliegue | Vercel | Deploy del proyecto y de las envs |
| Auth deployment-to-deployment | Vercel OIDC | Llamadas TUI/deployment-to-deployment vía eve |
