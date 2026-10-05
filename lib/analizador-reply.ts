import type { EveMessage } from "eve/client";

/**
 * Marca el texto que el propio navegador inyecta (ver components/use-analizador-poll.ts)
 * cuando el polling directo al backend (widget_back_end): /analizador/status detecta que una investigación larga
 * del analizador ya tiene respuesta, sin que el usuario haya vuelto a escribir. Mismo
 * patrón que ESCALATION_REPLY_PREFIX en lib/escalation.ts: eve no tiene forma de mandar
 * texto como si fuera un mensaje del propio asistente — todo `send()` entra como turno de
 * usuario — así que la UI lo oculta (ver `isAnalizadorReplyMessage`) y deja que se vea
 * solo la respuesta que el agente genera a partir de él.
 */
export const ANALIZADOR_REPLY_PREFIX = "[RESPUESTA_ANALIZADOR] ";

/** True si `message` es el turno "user" sintético inyectado por el polling del analizador. */
export function isAnalizadorReplyMessage(message: EveMessage): boolean {
  if (message.role !== "user") return false;
  return message.parts.some(
    (part) => part.type === "text" && part.text.startsWith(ANALIZADOR_REPLY_PREFIX),
  );
}
