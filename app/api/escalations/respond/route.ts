import { Client } from "eve/client";
import { NextResponse, type NextRequest } from "next/server";

import { ESCALATION_REPLY_PREFIX } from "@/lib/escalation";

export const runtime = "nodejs";

/**
 * Endpoint que reanuda una sesión de eve pausada tras un escalamiento (ver
 * `agent/tools/escalar.ts` y la sección "Escalación de casos" de
 * `agent/instructions.md`).
 *
 * Flujo completo:
 * 1. `escalar` publica el caso en Slack con el sessionId de eve en el campo `executionId`
 *    del payload. El servicio de Slack lo persiste en su base de datos.
 * 2. El agente queda en espera (llama a `ask_question`, la sesión queda en `session.waiting`).
 * 3. Cuando el equipo responde en Slack, el servicio de Slack busca el sessionId asociado
 *    y hace POST aquí con `{ sessionId, mensaje }`.
 * 4. Reanudamos esa sesión exacta con el mensaje del equipo. El agente (instruido para
 *    reconocer el prefijo `[RESPUESTA_ESCALAMIENTO]`) se lo transmite al usuario.
 *
 * Protegido con un secreto compartido simple (header `Authorization: Bearer <secreto>`)
 * porque, a diferencia del widget público, este endpoint puede inyectar texto en
 * cualquier sesión si alguien adivina/filtra un sessionId. Configura
 * `ESCALATION_RESPONSE_API_KEY` en el entorno y pásale el mismo valor al servicio de
 * Slack. Si la env var no está seteada, el endpoint queda abierto (útil solo para
 * probar en local) — no lo dejes así en producción.
 */

interface RespondBody {
  readonly sessionId?: unknown;
  readonly mensaje?: unknown;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ESCALATION_RESPONSE_API_KEY?.trim();
  if (apiKey) {
    const provided = request.headers.get("authorization");
    if (provided !== `Bearer ${apiKey}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  let body: RespondBody;
  try {
    body = (await request.json()) as RespondBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim() : "";
  if (!sessionId || !mensaje) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_fields",
        detail: "Se requieren 'sessionId' y 'mensaje' en el body.",
      },
      { status: 400 },
    );
  }

  // Mismo origen que el propio deployment (el widget usa host:"" desde el navegador;
  // aquí, corriendo en el servidor, necesitamos una URL absoluta). EVE_SERVICE_HOST
  // permite forzar un valor si el origen público difiere del origen de esta request.
  const host = process.env.EVE_SERVICE_HOST?.trim() || new URL(request.url).origin;
  const client = new Client({ host });

  try {
    // Paso 1: recuperar el continuationToken vigente. Solo tenemos el sessionId (lo
    // único que el servicio de Slack persistió), y .stream({startIndex:-1}) no muta el
    // estado interno de la sesión que lo emite — hay que leer el token del evento
    // session.waiting y construir una sesión nueva con él antes de poder mandar el send.
    // Sin `signal`, un sessionId inexistente o una sesión que ya no está parqueada deja
    // el stream abierto indefinidamente (long-poll esperando el próximo evento) — de ahí
    // el timeout. Con un límite explícito, en vez de colgarse, cae al catch de abajo con
    // un error claro.
    const peek = client.session({ sessionId, streamIndex: 0 });
    let continuationToken: string | undefined;
    try {
      for await (const event of peek.stream({ startIndex: -1, signal: AbortSignal.timeout(10_000) })) {
        if (event.type === "session.waiting") {
          continuationToken = event.data.continuationToken;
        }
        break;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        {
          ok: false,
          error: "session_lookup_timeout",
          detail: `No se pudo leer el estado de la sesión (${detail}). Verifica que el ` +
            "sessionId sea exactamente el que se envió al escalar, y que esa conversación " +
            "siga parqueada esperando respuesta.",
        },
        { status: 504 },
      );
    }

    if (!continuationToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_not_waiting",
          detail:
            "La sesión no está esperando una respuesta (pudo haber expirado, ya haberse " +
            "resuelto, o el sessionId no existe).",
        },
        { status: 409 },
      );
    }

    // Paso 2: reanudar con el mensaje del equipo, prefijado para que el agente lo
    // reconozca como respuesta de soporte y no como un mensaje del usuario final.
    const session = client.session({ sessionId, continuationToken, streamIndex: 0 });
    const response = await session.send(`${ESCALATION_REPLY_PREFIX}${mensaje}`);
    const result = await response.result();

    return NextResponse.json({
      ok: true,
      // Texto legible para que el servicio de Slack lo postee de vuelta en el canal/hilo
      // como confirmación de que la respuesta llegó al usuario.
      mensaje: describeDeliveryStatus(result.status),
      status: result.status,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: "resume_failed", detail }, { status: 502 });
  }
}

function describeDeliveryStatus(status: "completed" | "failed" | "waiting"): string {
  switch (status) {
    case "completed":
      return "Respuesta entregada al usuario. La conversación quedó cerrada.";
    case "waiting":
      return "Respuesta entregada al usuario. El agente sigue disponible por si responde de nuevo.";
    case "failed":
      return "La respuesta se envió, pero el agente falló al procesarla. Puede requerir revisión manual.";
  }
}
