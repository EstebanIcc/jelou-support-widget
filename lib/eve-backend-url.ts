/**
 * Arma una URL contra widget_back_end a partir de NEXT_PUBLIC_EVE_BACKEND_URL —
 * usado por todo lo que le pega al backend con `fetch` plano en vez de con el
 * `Client` de eve (que ya normaliza esto solo, ver createClientUrl en
 * node_modules/eve/dist/src/client/url.js): lib/conversation-history.ts,
 * use-chat-attachments.ts, use-analizador-poll.ts y el feedback de
 * app/_components/agent-message.tsx.
 *
 * Saca cualquier "/" final de la env var antes de concatenar el path (que siempre
 * empieza con "/"): si la variable queda seteada con barra final en Vercel (p.ej.
 * "https://widgetbackend-mu.vercel.app/"), sin este trim el resultado queda con doble
 * barra ("https://.../​/conversations"), que el router de eve no matchea contra la
 * ruta "/conversations" — eve sí es tolerante a esto en su propio Client, pero estos
 * fetches manuales no, y fallaban en silencio (se veían como "no hay conversaciones"
 * en vez de un error visible).
 */
export function eveBackendUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_EVE_BACKEND_URL ?? "").replace(/\/+$/, "");
  return `${base}${path}`;
}
