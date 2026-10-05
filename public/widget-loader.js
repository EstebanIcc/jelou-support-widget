(function () {
  "use strict";

  var currentScript = document.currentScript;
  if (!currentScript || !currentScript.src) {
    console.error("[jelou-widget] no se pudo determinar la URL del script. Usa <script src=\"...\">.");
    return;
  }

  var scriptUrl = new URL(currentScript.src);
  var origin = scriptUrl.origin;

  var title = currentScript.getAttribute("data-title") || "";
  var subtitle = currentScript.getAttribute("data-subtitle") || "";
  var email = currentScript.getAttribute("data-email") || "";
  // sessionId lo genera la página que embebe el widget (Jelou apps) — se usa junto al
  // companyId (resuelto server-side a partir del email) para pedir el api-key dinámico
  // del CLI. Sin este dato, el analizador queda inutilizable para esa sesión.
  var sessionId = currentScript.getAttribute("data-session-id") || "";
  var position = currentScript.getAttribute("data-position") === "left" ? "left" : "right";
  var offset = currentScript.getAttribute("data-offset") || "0px";

  // Log en la consola del navegador del sitio que integra el widget: confirma
  // exactamente qué leyó el loader de los atributos data-* del <script>, antes de
  // armar la URL del iframe. Útil para detectar un typo en el atributo o un valor
  // vacío del lado de quien integra, sin tener que mirar el servidor.
  console.log("[jelou-widget] atributos leídos del script:", {
    title: title || "(vacío)",
    subtitle: subtitle || "(vacío)",
    email: email || "(vacío)",
    sessionId: sessionId || "(vacío)",
    position: position,
    offset: offset,
  });

  // El contenedor va con `[position]: offset` y `bottom: offset` (ver mount() más abajo)
  // — si el ancho/alto se clampeara solo contra 100vw/100vh (sin restar ese offset), en
  // una pantalla angosta con un data-offset distinto de 0 el contenedor terminaba más
  // ancho/alto que el espacio real disponible entre su borde offseteado y el borde
  // opuesto del viewport, y se salía de la pantalla por el lado contrario (por ejemplo,
  // con offset="16px" en un celular de 375px, min(400px, 100vw) daba 375px, pero
  // posicionado con right:16px eso arrancaba 16px afuera del borde izquierdo). Restar el
  // offset en el propio calc() del clamp asegura que el contenedor SIEMPRE entre entero
  // en el viewport, sin importar el ancho de pantalla ni el offset configurado.
  var CLOSED_SIZE = {
    width: "min(88px, calc(100vw - " + offset + "))",
    height: "min(88px, calc(100vh - " + offset + "))",
  };
  // 420 de ancho: coincide con el panel abierto ("preset Large", ver el className del
  // panel en components/chat-widget.tsx — w-[min(420px,...)]). Un iframe siempre recorta
  // su contenido a su propio tamaño, así que si este contenedor fuera más angosto que el
  // panel de adentro, se verían los 20px de más directamente cortados — no es un
  // problema de "responsive" en pantallas chicas (ahí min() ya lo resuelve), pasaba
  // siempre, en cualquier pantalla lo bastante ancha para llegar al tamaño objetivo.
  //
  // 772 de alto, NO 680: el panel comparte el contenedor flex-col con el botón flotante
  // (ver el className del panel, mismo comentario ahí) — adentro de este iframe, ese
  // contenedor SIEMPRE usa los offsets "mobile" (bottom-4/inset-x-4 = 16px), porque el
  // iframe nunca llega a los 640px del breakpoint `sm:` de Tailwind. 772 = 680 (panel) +
  // 48 (botón, size-12) + 12 (gap-3) + 16 (offset inferior) + 16 (margen simétrico
  // arriba) — si el contenedor fuera solo 680, el panel + botón entre los dos ya no
  // entraban, y el panel se recortaba contra el borde de arriba del iframe.
  var OPEN_SIZE = {
    width: "min(420px, calc(100vw - " + offset + "))",
    height: "min(772px, calc(100vh - " + offset + "))",
  };
  // Tamaño intermedio: panel cerrado pero con la burbuja "el agente respondió" asomando
  // (ver AgentReplyToast en components/chat-widget.tsx) — necesita más lugar que el botón
  // solo (CLOSED_SIZE) pero no tanto como el panel abierto.
  var PEEK_SIZE = {
    width: "min(340px, calc(100vw - " + offset + "))",
    height: "min(180px, calc(100vh - " + offset + "))",
  };

  function buildWidgetUrl() {
    var url = new URL("/widget", origin);
    if (title) url.searchParams.set("title", title);
    if (subtitle) url.searchParams.set("subtitle", subtitle);
    if (email) url.searchParams.set("email", email);
    if (sessionId) url.searchParams.set("sessionId", sessionId);
    return url.toString();
  }

  function mount() {
    var container = document.createElement("div");
    container.id = "jelou-widget-container";
    container.style.position = "fixed";
    container.style.bottom = offset;
    container.style[position] = offset;
    container.style.zIndex = "2147483647";
    container.style.border = "none";
    container.style.transition = "width 0.15s ease, height 0.15s ease";
    container.style.width = CLOSED_SIZE.width;
    container.style.height = CLOSED_SIZE.height;

    var iframe = document.createElement("iframe");
    iframe.src = buildWidgetUrl();
    iframe.title = title || "Asistente Jelou";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.style.background = "transparent";
    iframe.setAttribute("allowtransparency", "true");

    container.appendChild(iframe);
    document.body.appendChild(container);

    window.addEventListener("message", function (event) {
      if (event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || data.source !== "jelou-widget" || data.type !== "resize") return;
      var size = data.open ? OPEN_SIZE : data.peek ? PEEK_SIZE : CLOSED_SIZE;
      container.style.width = size.width;
      container.style.height = size.height;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
