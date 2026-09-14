const DEFAULT_URL = "http://gateway.jelou.ai/platform/v1/utils/users";

/** Cuánto se conserva en memoria un lookup ya resuelto antes de volver a pedirlo. */
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface JelouUserContext {
  readonly user: {
    readonly email: string;
    readonly names: string;
  };
  readonly company: {
    readonly id: number;
    readonly name: string;
    readonly plan: string;
  };
}

type CacheEntry = { readonly value: JelouUserContext | null; readonly expiresAt: number };

/**
 * Cache en memoria del proceso, no compartida entre instancias serverless. El auth de
 * `agent/channels/eve.ts` corre en cada request a las rutas de eve (create/continue/
 * stream de sesión), y sin esto cada una de esas requests dispararía un fetch nuevo al
 * gateway por el mismo email — este cache evita eso durante la vida de una conversación.
 */
const cache = new Map<string, CacheEntry>();

/**
 * Resuelve nombre de usuario y compañía a partir de un correo, contra el gateway interno
 * de Jelou. Server-side únicamente — la api-key nunca debe llegar al navegador; por eso
 * esta función solo se llama desde `agent/channels/eve.ts` (auth de las rutas de eve, que
 * corre en el servidor), nunca desde un componente de cliente.
 *
 * Devuelve `null` (nunca lanza) ante cualquier fallo — email no encontrado, gateway caído,
 * api-key sin configurar, respuesta inesperada — para que el widget siga funcionando de
 * forma anónima en vez de romperse cuando el lookup no se puede resolver.
 */
export async function lookupUserContext(email: string): Promise<JelouUserContext | null> {
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

async function fetchUserContext(email: string): Promise<JelouUserContext | null> {
  const apiKey = process.env.JELOU_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "[jelou-gateway] JELOU_GATEWAY_API_KEY no configurada; se omite la resolución de usuario/compañía.",
    );
    return null;
  }

  const url = new URL(process.env.JELOU_GATEWAY_URL?.trim() || DEFAULT_URL);
  url.searchParams.set("email", email);

  console.log(`[jelou-gateway] GET ${url.toString()} (email=${email})`);

  try {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(8_000),
    });

    const rawBody = await response.text();
    console.log(`[jelou-gateway] respuesta status=${response.status} body=${rawBody}`);

    if (!response.ok) return null;

    const json = JSON.parse(rawBody) as {
      status?: number;
      data?: {
        user?: { email?: string; names?: string };
        company?: { id?: number; name?: string; plan?: string };
      };
    };

    const user = json.data?.user;
    const company = json.data?.company;
    if (json.status !== 1 || !user?.email || company?.id === undefined || !company.name) {
      console.log("[jelou-gateway] respuesta sin el shape esperado (status/user/company) — se descarta.");
      return null;
    }

    const resolved: JelouUserContext = {
      company: { id: company.id, name: company.name, plan: company.plan ?? "" },
      user: { email: user.email, names: user.names ?? "" },
    };
    console.log("[jelou-gateway] resuelto:", resolved);
    return resolved;
  } catch (error) {
    // Timeout, red caída, JSON inválido, etc. — se trata igual que "no encontrado".
    console.log("[jelou-gateway] fallo al resolver:", error);
    return null;
  }
}
