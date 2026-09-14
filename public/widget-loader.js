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

  var CLOSED_SIZE = { width: "88px", height: "88px" };
  var OPEN_SIZE = { width: "min(400px, 100vw)", height: "min(640px, 100vh)" };

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
      var size = data.open ? OPEN_SIZE : CLOSED_SIZE;
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
