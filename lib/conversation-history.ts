/**
 * Historial de conversaciones pasadas del widget (vista "Mensajes" tipo Intercom, ver
 * components/conversation-list.tsx y el bloque de "retomar" en chat-widget.tsx). Lee
 * de GET /conversations y GET /conversations/messages en widget_back_end
 * (agent/channels/widget-http.ts), que a su vez consultan ClickHouse
 * (agent/lib/clickhouse.ts) — ver el doc del proyecto
 * "clickhouse-conversaciones-nps.md". Mismo host/convención que use-chat-attachments.ts
 * y use-analizador-poll.ts (NEXT_PUBLIC_EVE_BACKEND_URL).
 */

import { eveBackendUrl } from "@/lib/eve-backend-url";

/** Una conversación pasada, tal como se muestra en la lista (preview + fecha). */
export interface ConversationSummary {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly status: string;
  readonly messageCount: number;
  readonly lastMessage: string;
}

/** Una tool call resuelta del transcript, colgada del mensaje de asistente del mismo turno. */
export interface ConversationTranscriptToolCall {
  readonly toolCallId: string;
  readonly toolName: string;
  /** Output real de la tool, ya parseado; undefined en conversaciones de antes de este campo. */
  readonly output: unknown;
  readonly isError: boolean;
}

/** Un mensaje (usuario o asistente) del transcript completo de una conversación pasada. */
export interface ConversationTranscriptMessage {
  readonly role: string;
  readonly content: string;
  readonly occurredAt: string;
  readonly turnId: string;
  /** Tool calls del turno (solo en mensajes de asistente) — ver buildHistoricalMessages en chat-widget.tsx. */
  readonly toolCalls: readonly ConversationTranscriptToolCall[];
}

interface RawConversation {
  readonly session_id: string;
  readonly started_at: string;
  readonly ended_at: string;
  readonly status: string;
  readonly message_count: number;
  readonly last_message: string;
}

interface RawTranscriptToolCall {
  readonly tool_call_id: string;
  readonly tool_name: string;
  readonly output: unknown;
  readonly is_error: boolean;
}

interface RawTranscriptMessage {
  readonly role: string;
  readonly content: string;
  readonly occurred_at: string;
  readonly turn_id: string;
  readonly tool_calls: readonly RawTranscriptToolCall[];
}



/** Trae las conversaciones de los últimos 7 días del visitante identificado por `email`. */
export async function fetchRecentConversations(
  email: string,
): Promise<ConversationSummary[]> {
  const response = await fetch(eveBackendUrl("/conversations"), {
    headers: { "x-jelou-user-email": email },
  });
  if (!response.ok) {
    throw new Error(`conversations_fetch_failed:${response.status}`);
  }
  const json = (await response.json()) as {
    ok: boolean;
    conversations?: readonly RawConversation[];
  };
  if (!json.ok || !json.conversations) {
    throw new Error("conversations_fetch_failed");
  }
  return json.conversations.map((item) => ({
    endedAt: item.ended_at,
    lastMessage: item.last_message,
    messageCount: item.message_count,
    sessionId: item.session_id,
    startedAt: item.started_at,
    status: item.status,
  }));
}

/** Trae el transcript completo (solo texto) de una conversación pasada puntual. */
export async function fetchConversationTranscript(
  sessionId: string,
  email: string,
): Promise<ConversationTranscriptMessage[]> {
  const params = new URLSearchParams({ sessionId });
  const response = await fetch(
    eveBackendUrl(`/conversations/messages?${params.toString()}`),
    { headers: { "x-jelou-user-email": email } },
  );
  if (!response.ok) {
    throw new Error(`conversation_transcript_fetch_failed:${response.status}`);
  }
  const json = (await response.json()) as {
    ok: boolean;
    messages?: readonly RawTranscriptMessage[];
  };
  if (!json.ok || !json.messages) {
    throw new Error("conversation_transcript_fetch_failed");
  }
  return json.messages.map((item) => ({
    content: item.content,
    occurredAt: item.occurred_at,
    role: item.role,
    turnId: item.turn_id,
    toolCalls: item.tool_calls.map((call) => ({
      toolCallId: call.tool_call_id,
      toolName: call.tool_name,
      output: call.output,
      isError: call.is_error,
    })),
  }));
}

/**
 * Marca el bloque de texto que chat-widget.tsx antepone (oculto, ver
 * pendingResumeContextRef en handleSubmit) al primer mensaje nuevo después de que el
 * usuario elige "retomar" una conversación pasada — mismo patrón que
 * ANALIZADOR_REPLY_PREFIX (lib/analizador-reply.ts) y ESCALATION_REPLY_PREFIX
 * (lib/escalation.ts): el agente sí necesita leer este texto (por eso viaja tal cual
 * al backend/modelo), pero el usuario nunca lo escribió, así que agent-message.tsx lo
 * saca del texto visible de la burbuja.
 */
export const RESUME_CONTEXT_MARKER_PREFIX = "[Contexto de conversación anterior]";

/**
 * Arma el bloque de contexto oculto a partir del transcript de la conversación
 * elegida — texto plano simple (Usuario:/Agente: por línea) en vez de JSON: es lo que
 * el modelo va a leer directamente como parte del mensaje, no algo que se parsee de
 * vuelta en ningún lado.
 */
export function buildResumeContextMessage(
  messages: readonly ConversationTranscriptMessage[],
): string | undefined {
  if (messages.length === 0) return undefined;
  const lines = messages.map(
    (message) =>
      `${message.role === "user" ? "Usuario" : "Agente"}: ${message.content}`,
  );
  return [
    RESUME_CONTEXT_MARKER_PREFIX,
    ...lines,
    "[Fin del contexto anterior — el usuario retoma la conversación desde acá]",
  ].join("\n");
}
