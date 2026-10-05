"use client";

import type { EveMessage } from "eve/client";
import { useMemo } from "react";

import { getActiveToolLabel } from "@/app/_components/agent-message";

/** Texto neutro mientras el modelo todavía no llamó ninguna tool en este turno (o va a
 * responder directo, sin tools) — antes de eso no hay nada más específico que mostrar. */
const DEFAULT_LABEL = "Pensando…";

/**
 * Texto del indicador "el agente está trabajando" que ChatWidget/AgentChat muestran
 * mientras `isBusy` (ver ese componente). Antes era un texto fijo ("Consultando docs
 * Jelou…") sin importar qué estuviera haciendo el agente en realidad — ahora refleja la
 * tool que está corriendo en este momento en el último mensaje del historial, reusando
 * el mismo mapeo de nombres legibles que ya usa cada fila de tool call individual (ver
 * getToolDisplayName en app/_components/agent-message.tsx), así el texto de "buscando en
 * la documentación" / "investigando tu caso" / "escalando el caso" coincide exactamente
 * con lo que esa fila va a mostrar apenas se renderice el mensaje.
 */
export function useActiveToolLabel(messages: readonly EveMessage[]): string {
  return useMemo(() => getActiveToolLabel(messages) ?? DEFAULT_LABEL, [messages]);
}
