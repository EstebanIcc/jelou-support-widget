"use client";

import { useEffect, useRef } from "react";
import type { ClientSession } from "eve/client";
import type {
  EveMessage,
  EveMessageData,
  UseEveAgentHelpers,
} from "eve/react";

import { ANALIZADOR_REPLY_PREFIX } from "@/lib/analizador-reply";
import { eveBackendUrl } from "@/lib/eve-backend-url";

/**
 * Cada cuánto pregunta el backend (widget_back_end): /analizador/status mientras hay una investigación pendiente.
 * jelou-ops-support-chat recomienda 15-30s para este tipo de chequeo (ver el comentario
 * en widget_back_end/agent/lib/ops-support-chat.ts) — nos quedamos en la mitad de ese rango.
 */
const POLL_INTERVAL_MS = 20_000;

/**
 * Deja de insistir solo después de este tiempo sin respuesta — evita un `setTimeout` que
 * viva para siempre si la investigación nunca termina o el usuario deja la pestaña
 * abierta sin volver. El usuario igual puede preguntar de nuevo en cualquier momento;
 * eso dispara el chequeo reactivo normal de widget_back_end/agent/tools/analizador.ts.
 */
const MAX_POLL_DURATION_MS = 20 * 60 * 1000;

interface PendingAnalizadorCall {
  readonly ticket: string;
  readonly pollToken: string;
}

function isPendingOutput(
  value: unknown,
): value is { estado: string; ticket?: string; pollToken?: string } {
  return typeof value === "object" && value !== null && "estado" in value;
}

/** Último tool call del analizador en todo el historial, si sigue "en_progreso". */
function findPendingAnalizadorCall(
  messages: readonly EveMessage[],
): PendingAnalizadorCall | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i]?.parts ?? [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (!part || part.type !== "dynamic-tool") continue;
      if ((part.toolMetadata?.eve?.name ?? part.toolName) !== "analizador") {
        continue;
      }
      if (part.state !== "output-available") return undefined;

      const output = part.output;
      if (
        !isPendingOutput(output) ||
        output.estado !== "en_progreso" ||
        !output.ticket ||
        !output.pollToken
      ) {
        return undefined;
      }
      return { ticket: output.ticket, pollToken: output.pollToken };
    }
  }
  return undefined;
}

/**
 * Mientras haya una investigación del analizador en curso (ver "Respuesta tardía del
 * analizador" en agent/instructions.md), pregunta cada cierto tiempo directo a
 * el backend (widget_back_end): /analizador/status — sin pasar por el modelo — si ya hay respuesta. Apenas la haya,
 * la inyecta en la conversación con `agent.send`, con el prefijo que
 * lib/analizador-reply.ts define para que la UI la oculte y solo se vea la respuesta que
 * el propio agente genera a partir de ella.
 *
 * Vive mientras el componente que la usa esté montado: sin base de datos ni Cron Job de
 * por medio (decisión tomada explícitamente — ver la conversación de diseño), este aviso
 * automático solo funciona con la pestaña/panel abiertos. Si el usuario la cierra y
 * vuelve más tarde, la respuesta sigue esperando — el próximo uso del analizador en esa
 * conversación la recupera igual (ver widget_back_end/agent/tools/analizador.ts).
 */
export function useAnalizadorPoll(
  agent: Pick<UseEveAgentHelpers<EveMessageData>, "data" | "send">,
  session: ClientSession,
): void {
  const resolvedTicketsRef = useRef<Set<string>>(new Set());
  const pending = findPendingAnalizadorCall(agent.data.messages);
  const ticket = pending?.ticket;
  const pollToken = pending?.pollToken;

  useEffect(() => {
    if (!ticket || !pollToken) return;
    if (resolvedTicketsRef.current.has(ticket)) return;

    const eveSessionId = session.state.sessionId;
    if (!eveSessionId) return;

    let cancelled = false;
    let seenCount = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelled || Date.now() - startedAt > MAX_POLL_DURATION_MS) {
        return;
      }

      try {
        const params = new URLSearchParams({
          ticket,
          session: eveSessionId,
          token: pollToken,
          after: String(seenCount),
        });
        const response = await fetch(
          eveBackendUrl(`/analizador/status?${params.toString()}`),
        );
        if (response.ok) {
          const json = (await response.json()) as {
            ok?: boolean;
            respuesta?: string;
            seenCount?: number;
          };
          if (typeof json.seenCount === "number") {
            seenCount = json.seenCount;
          }
          if (json.ok && json.respuesta) {
            resolvedTicketsRef.current.add(ticket);
            cancelled = true;
            void agent.send({ message: `${ANALIZADOR_REPLY_PREFIX}${json.respuesta}` });
            return;
          }
        }
      } catch {
        // Fallo de red puntual: seguimos intentando en el próximo tick, no cortamos el
        // polling por un solo error transitorio.
      }

      if (!cancelled) {
        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Solo reinicia el polling cuando cambia la investigación pendiente (ticket/token
    // nuevos) — no en cada render. `agent`/`session` son estables por identidad durante
    // la vida del componente que los crea (ver chat-widget.tsx / agent-chat.tsx).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket, pollToken]);
}
