import { eveChannel } from "eve/channels/eve";
import { localDev, none, vercelOidc, type AuthFn } from "eve/channels/auth";

import { lookupUserContext } from "../lib/jelou-gateway";

/**
 * Identifica al visitante del widget cuando el sitio que lo embebe le pasó un correo (ver
 * prop `email` en ChatWidget, componentes/chat-widget.tsx — se manda como header en cada
 * request a las rutas de eve, nunca como argumento del modelo). Resuelve nombre y compañía
 * contra el gateway de Jelou server-side — la api-key nunca llega al navegador — y los deja
 * en `ctx.session.auth.current.attributes` para que las instructions dinámicas
 * (agent/instructions/user-context.ts) los usen sin tener que preguntárselos al usuario.
 *
 * Si no hay header, o el lookup no encuentra nada, retorna `null` y la cadena de auth sigue
 * a `none()`: el chat sigue funcionando de forma anónima, nunca se bloquea por esto.
 */
function widgetUserAuth(): AuthFn<Request> {
  return async (request) => {
    const email = request.headers.get("x-jelou-user-email")?.trim();
    if (!email) {
      console.log("[widget-user-auth] sin header x-jelou-user-email — se salta.");
      return null;
    }

    // sessionId lo genera Jelou apps (la página que embebe el widget) y viaja junto al
    // correo — no es el session.id interno de eve. Se loguea acá, apenas llega el
    // header y ANTES de cualquier otra cosa, para poder confirmar el valor exacto que
    // mandó el widget, incluso si después el lookup de usuario falla. Se guarda en
    // attributes.sessionId solo para que agent/sandbox.ts lo use al resolver el
    // api-key dinámico del CLI (ver agent/lib/support-widget-service.ts). Si no llega,
    // el CLI simplemente no se autentica para esta sesión — no es un dato obligatorio
    // para identificar al usuario.
    const sessionId = request.headers.get("x-jelou-session-id")?.trim();
    console.log(`[widget-user-auth] header x-jelou-session-id: ${sessionId || "(vacío / no llegó)"}`);

    const context = await lookupUserContext(email);
    if (!context) {
      console.log(`[widget-user-auth] lookup sin resultado para ${email} — se salta.`);
      return null;
    }

    console.log(
      `[widget-user-auth] resuelto: ${context.user.names} <${context.user.email}> — ${context.company.name}`,
    );

    return {
      attributes: {
        companyId: String(context.company.id),
        companyName: context.company.name,
        companyPlan: context.company.plan,
        names: context.user.names,
        ...(sessionId ? { sessionId } : {}),
      },
      authenticator: "widget-email",
      principalId: context.user.email,
      principalType: "user",
    };
  };
}

export default eveChannel({
  auth: [
    // Llamadas deployment-to-deployment / TUI con token Vercel.
    vercelOidc(),
    // Widget con correo conocido (ver ChatWidget prop `email`): resuelve nombre y
    // compañía. Tiene que ir ANTES que localDev() — localDev() acepta cualquier
    // request por localhost sin mirar nada más, así que si quedara primero se comía
    // siempre la cadena en desarrollo local y widgetUserAuth() nunca llegaba a correr
    // (esto pasó de verdad: por eso el agente no tenía el contexto en las pruebas).
    widgetUserAuth(),
    // Localhost en desarrollo, sin correo conocido.
    localDev(),
    // Demo público del widget en el navegador (producción), sin correo conocido.
    // Si más adelante quieres login real, cámbialo por Auth.js / Clerk / etc.
    none(),
  ],
});
