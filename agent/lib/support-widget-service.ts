const DEFAULT_URL = "https://support-widget-service.fn.jelou.ai/";

/**
 * Resuelve el api-key dinámico que el CLI (analizador) debe usar para autenticarse,
 * a partir de companyId + sessionId. El servicio (jelou-dev-functions) valida si esa
 * company ya tiene un api-key creado (colección pbc_2268489868): si lo tiene lo
 * devuelve, si no lo crea con auth/api-keys.
 *
 * Sin caché acá: sessionId identifica una sesión puntual del widget (la genera Jelou
 * apps), no algo estable para cachear entre sesiones distintas como sí lo es el email
 * en jelou-gateway.ts. Se llama una vez por sesión, desde agent/sandbox.ts::onSession.
 *
 * Nunca lanza: si el servicio falla o no está configurado, devuelve null y quien
 * llama simplemente no autentica el CLI para esa sesión (el analizador queda
 * inutilizable, a propósito — no hay fallback a un token estático).
 */
export async function lookupCliApiKey(
  companyId: string,
  sessionId: string,
): Promise<string | null> {
  const token = process.env.SUPPORT_WIDGET_SERVICE_TOKEN?.trim();
  if (!token) {
    console.error(
      "[support-widget-service] SUPPORT_WIDGET_SERVICE_TOKEN no configurada; se omite la autenticación del CLI.",
    );
    return null;
  }
  if (!companyId || !sessionId) {
    console.log(
      `[support-widget-service] faltan datos (companyId=${companyId || "?"}, sessionId=${sessionId || "?"}) — se omite.`,
    );
    return null;
  }

  const url = process.env.SUPPORT_WIDGET_SERVICE_URL?.trim() || DEFAULT_URL;
  console.log(`[support-widget-service] POST ${url} (companyId=${companyId}, sessionId=${sessionId})`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ companyId, sessionId }),
      signal: AbortSignal.timeout(8_000),
    });

    const rawBody = await response.text();
    console.log(`[support-widget-service] respuesta status=${response.status} body=${rawBody}`);

    if (!response.ok) return null;

    const json = JSON.parse(rawBody) as { apiKey?: string };
    if (!json.apiKey) {
      console.log("[support-widget-service] respuesta sin apiKey — se descarta.");
      return null;
    }

    return json.apiKey;
  } catch (error) {
    console.log("[support-widget-service] fallo al resolver:", error);
    return null;
  }
}
