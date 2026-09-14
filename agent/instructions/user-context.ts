import { defineDynamic, defineInstructions } from "eve/instructions";

/**
 * Complementa agent/instructions.md (que se carga siempre) con un bloque que solo aparece
 * cuando la sesión trae un usuario identificado — ver widgetUserAuth en
 * agent/channels/eve.ts, que resuelve el correo que el sitio le pasó al widget (prop
 * `email` de ChatWidget) contra el gateway de Jelou y deja compañía/nombre en
 * ctx.session.auth.current.attributes.
 *
 * Se resuelve una sola vez por sesión (session.started) — no por turno — porque
 * `auth.current` puede variar entre turnos pero el objetivo acá es fijar el contexto una
 * vez al arrancar la conversación, igual que el resto de las instructions.
 */
export default defineDynamic({
  events: {
    "session.started": (_event, ctx) => {
      const caller = ctx.session.auth.current;
      const companyName = caller?.attributes.companyName;
      if (typeof companyName !== "string" || companyName.length === 0) {
        return null;
      }

      const names = typeof caller?.attributes.names === "string" ? caller.attributes.names : "";
      const companyPlan =
        typeof caller?.attributes.companyPlan === "string" ? caller.attributes.companyPlan : "";
      const companyId =
        typeof caller?.attributes.companyId === "string" ? caller.attributes.companyId : "";

      const detalles = [
        companyPlan ? `plan ${companyPlan}` : null,
        companyId ? `id ${companyId}` : null,
      ]
        .filter(Boolean)
        .join(", ");

      return defineInstructions({
        markdown: [
          "# Contexto del usuario actual",
          "",
          `Ya sabés quién está chateando, sin que lo haya dicho: ${names || "sin nombre registrado"} ` +
            `(${caller?.principalId}), de la compañía **${companyName}**${detalles ? ` (${detalles})` : ""}.`,
          "",
          "- No le preguntes su nombre ni su compañía — ya los tenés. Si tenés que escalar un " +
            `caso, usá "${companyName}" directamente como compañía, sin pedirlo con ask_question.`,
          "- Podés usar su nombre de forma natural si encaja en el tono, sin abusar ni repetirlo " +
            "en cada mensaje.",
          "- Si el usuario pregunta por su propia información (quién es, de qué compañía es, su " +
            "correo, su plan, etc.), respondele directamente con estos datos — no le digas que no " +
            "tenés esa información, y no lo mandes a buscarla a otro lado.",
          "- Para esta pregunta puntual (quién es, de qué compañía es) NO uses el analizador ni " +
            "ninguna otra tool: el analizador consulta el bot/proyecto que administra en la " +
            "plataforma (otro concepto, no la compañía/cliente al que pertenece la persona) y no " +
            "hace falta para esto — ya tenés la respuesta completa acá arriba.",
          "- Este contexto es interno: nunca menciones que viene de un \"lookup\", una \"API\" o " +
            "un servicio externo — para el usuario, simplemente ya lo sabías.",
        ].join("\n"),
      });
    },
  },
});
