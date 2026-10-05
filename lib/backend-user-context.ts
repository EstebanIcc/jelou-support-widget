const CACHE_TTL_MS = 5 * 60 * 1000;

export interface BackendUserContext {
  readonly name: string;
  readonly company: string;
}

type CacheEntry = { readonly value: BackendUserContext | null; readonly expiresAt: number };

/**
 * Reemplaza al antiguo `agent/lib/jelou-gateway.ts` (que vivía en este mismo proyecto
 * cuando el agente todavía corría embebido acá). Ahora ese lookup — y el secreto
 * JELOU_GATEWAY_API_KEY que necesita — vive solo en el backend (widget_back_end,
 * GET /internal/user-context, ver agent/channels/internal-http.ts). Este helper server-
 * side llama a ese endpoint solo para poder mostrar un saludo personalizado en la UI
 * antes de que exista ninguna conversación (ver app/page.tsx y app/widget/page.tsx) — el
 * contexto real que usa el agente para responder se resuelve aparte, en el backend, a
 * partir del header que ChatWidget manda a eve.
 *
 * Nunca se llama desde un componente de cliente — solo desde Server Components — así el
 * secreto compartido (USER_CONTEXT_API_KEY) nunca llega al navegador.
 */
const cache = new Map<string, CacheEntry>();

export async function lookupUserContext(email: string): Promise<BackendUserContext | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await fetchUserContext(normalized);
  cache.set(normalized, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function fetchUserContext(email: string): Promise<BackendUserContext | null> {
  const backendUrl = process.env.NEXT_PUBLIC_EVE_BACKEND_URL?.trim();
  if (!backendUrl) {
    console.error(
      "[backend-user-context] NEXT_PUBLIC_EVE_BACKEND_URL no configurada; se omite la resolución de usuario/compañía.",
    );
    return null;
  }

  const url = new URL("/internal/user-context", backendUrl);
  url.searchParams.set("email", email);

  const apiKey = process.env.USER_CONTEXT_API_KEY?.trim();

  try {
    const response = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const json = (await response.json()) as {
      ok?: boolean;
      context?: { name?: string; company?: string } | null;
    };
    if (!json.ok || !json.context) return null;

    return {
      name: json.context.name ?? "",
      company: json.context.company ?? "",
    };
  } catch (error) {
    console.log("[backend-user-context] fallo al resolver:", error);
    return null;
  }
}
