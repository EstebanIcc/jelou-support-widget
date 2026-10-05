import type { EveMessage } from "eve/client";

/**
 * Marca el texto que `el backend (widget_back_end): /escalations/respond` inyecta como turno "user" al
 * reanudar una sesión pausada por un escalamiento (ver ese route handler y la
 * sección "Respuesta del equipo al escalamiento" de agent/instructions.md).
 * eve no tiene forma de mandar ese texto como si fuera un mensaje del propio
 * asistente — todo `send()` entra como turno de usuario — así que en vez de
 * mostrarlo como si el usuario lo hubiera escrito, la UI lo oculta (ver
 * `isEscalationReplyMessage`) y deja que se vea únicamente la respuesta que el
 * agente genera a partir de él.
 */
export const ESCALATION_REPLY_PREFIX = "[RESPUESTA_ESCALAMIENTO] ";

/** True si `message` es el turno "user" sintético inyectado por el resume de un escalamiento. */
export function isEscalationReplyMessage(message: EveMessage): boolean {
  if (message.role !== "user") return false;
  return message.parts.some(
    (part) => part.type === "text" && part.text.startsWith(ESCALATION_REPLY_PREFIX),
  );
}
