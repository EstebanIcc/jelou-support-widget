import type { ToolContext } from "eve/tools";

import { lookupCliApiKey } from "./support-widget-service";

/**
 * Resuelve el api-key dinámico del CLI y autentica el sandbox la primera vez que el
 * analizador se usa en una sesión — código determinístico dentro de la tool (ver
 * agent/tools/analizador.ts), no un hook de ciclo de vida de sesión ni una regla de
 * instructions.
 *
 * Historial de la investigación (dejarlo documentado porque no es obvio): con
 * `--no-input`, `jelou login` EXIGE el flag `--token` (si se omite, falla con
 * `INPUT_ERROR: --token is required in non-interactive mode`) — así que va con
 * `--token "$JELOU_TOKEN"`, leyendo el valor de `env`, nunca interpolado en el comando.
 *
 * El api-key que devolvía support-widget-service para companyId=5 (con `created:
 * false`, o sea uno YA existente en pbc_2268489868, no uno nuevo) fue rechazado por
 * IGUAL con `AUTH_ERROR: Unauthenticated` tanto vía `--token` como vía `JELOU_TOKEN`
 * suelto en un comando — dos mecanismos distintos, mismo rechazo. Eso descarta que sea
 * un tema de cómo lo pasamos: el valor en sí no es válido para el backend de auth de
 * Jelou. Si esto vuelve a fallar, el problema probablemente está en ese registro
 * existente (revisar con quien mantenga support-widget-service / auth/api-keys), no en
 * este archivo.
 *
 * Cada comando real que corre analizador.ts también manda `JELOU_TOKEN` en su propio
 * `env`, además del login — no cuesta nada de más y cubre igual si el CLI espera la
 * credencial por comando en vez de (o además de) por sesión logueada.
 *
 * Cachea el api-key Y el resultado del login en memoria por sessionId de eve, para no
 * repetir la llamada a support-widget-service ni el login en cada uso del analizador
 * dentro de la misma sesión. Un fallo NO se cachea a propósito: el siguiente uso del
 * analizador en la misma sesión vuelve a intentarlo solo.
 */
const cachedApiKeys = new Map<string, string>();
const loggedInSessions = new Set<string>();

export interface CliToken {
  readonly apiKey: string;
}

/**
 * Devuelve el api-key a usar como `JELOU_TOKEN` en cada comando, o un mensaje de error
 * listo para mostrar como `stderr` si no se pudo resolver ni autenticar.
 */
export async function resolveCliToken(ctx: ToolContext): Promise<CliToken | { error: string }> {
  const eveSessionId = ctx.session.id;

  let apiKey = cachedApiKeys.get(eveSessionId);
  if (!apiKey) {
    const attributes = ctx.session.auth.current?.attributes;
    const companyId = typeof attributes?.companyId === "string" ? attributes.companyId : undefined;
    const sessionId = typeof attributes?.sessionId === "string" ? attributes.sessionId : undefined;
    if (!companyId || !sessionId) {
      const reason = `sin companyId/sessionId (companyId=${companyId ?? "?"}, sessionId=${sessionId ?? "?"})`;
      console.log(`[cli-auth] ${reason} — no se puede autenticar el CLI.`);
      return {
        error:
          "No se pudo identificar la compañía o la sesión del visitante, así que el analizador no está disponible ahora mismo.",
      };
    }

    const resolved = await lookupCliApiKey(companyId, sessionId);
    if (!resolved) {
      console.log("[cli-auth] no se resolvió apiKey — CLI queda sin autenticar.");
      return { error: "No se pudo obtener la autorización necesaria para el analizador en este momento." };
    }

    apiKey = resolved;
    cachedApiKeys.set(eveSessionId, apiKey);
  }

  if (!loggedInSessions.has(eveSessionId)) {
    const sandbox = await ctx.getSandbox();
    const loginResult = await sandbox.run({
      command:
        'jelou login --token "$JELOU_TOKEN" --no-input --profile default --skip-skills --agent',
      env: { JELOU_TOKEN: apiKey },
    });
    console.log(
      `[cli-auth] jelou login exitCode=${loginResult.exitCode} stdout=${loginResult.stdout.slice(0, 500)} stderr=${loginResult.stderr.slice(0, 500)}`,
    );

    if (loginResult.exitCode === 0) {
      loggedInSessions.add(eveSessionId);
    } else {
      console.log("[cli-auth] jelou login falló — se sigue igual, JELOU_TOKEN por comando queda como respaldo.");
    }
  }

  return { apiKey };
}
