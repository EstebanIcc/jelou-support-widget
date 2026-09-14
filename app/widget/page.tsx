import { lookupUserContext } from "@/agent/lib/jelou-gateway";
import { firstName } from "@/lib/utils";

import { WidgetBackground } from "./widget-background";
import { WidgetClient } from "./widget-client";

type SearchParams = { [key: string]: string | string[] | undefined };

/**
 * Página dedicada exclusivamente a embeberse en un <iframe> de sitios externos (ver
 * public/widget-loader.js). No lleva nada de la landing/demo — solo el widget.
 *
 * Server Component (no "use client"): si el sitio embebedor pasó `?email=...` (desde
 * `data-email` en el loader), resolvemos el nombre acá mismo, server-side, para poder
 * mostrarle un saludo personalizado al widget sin que el navegador tenga que pedirlo por
 * su cuenta. El lookup real de compañía para el agente (con más detalle) ya corre aparte,
 * en agent/channels/eve.ts vía el header que ChatWidget manda a eve — esto es solo para
 * tener el nombre disponible en la UI antes de que exista ninguna conversación.
 */
export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const title = paramString(params.title);
  const subtitle = paramString(params.subtitle);
  const email = paramString(params.email);
  // sessionId lo genera Jelou apps y viaja sin tocar hasta el header que arma eve.ts
  // (widgetUserAuth) — no se usa acá, solo se reenvía.
  const sessionId = paramString(params.sessionId);

  // Log de lo que efectivamente llegó a /widget vía query params (arman el src del
  // <iframe> a partir de los data-* del script tag — ver public/widget-loader.js). Sirve
  // para confirmar, del lado del servidor, que el sitio que integra el widget está
  // mandando lo que cree que está mandando, antes de que nada de esto siga camino al
  // agente (ver también los logs [widget-user-auth] en agent/channels/eve.ts).
  console.log(
    `[widget] params recibidos: title=${title ?? "(vacío)"} subtitle=${subtitle ?? "(vacío)"} email=${email ?? "(vacío)"} sessionId=${sessionId ?? "(vacío)"}`,
  );

  const context = email ? await lookupUserContext(email) : null;

  return (
    <>
      <WidgetBackground />
      <WidgetClient
        email={email}
        name={firstName(context?.user.names)}
        sessionId={sessionId}
        subtitle={subtitle}
        title={title}
      />
    </>
  );
}

function paramString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
