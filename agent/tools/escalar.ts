import { defineTool } from "eve/tools";
import { z } from "zod";

const SLACK_ENDPOINT = "https://slack-service-two.vercel.app/slack/post";

/**
 * Mención de Slack por equipo — user groups reales (`<!subteam^ID>`), confirmados por
 * el usuario, no @handles de texto plano. `tech_support` es el grupo de respaldo: se
 * usa cuando el agente no logra identificar a qué equipo corresponde el error (ver
 * agent/instructions.md, paso 2 de la escalación).
 */
const TEAM_MENTIONS = {
  brain: "<!subteam^S05JGCVL0BY>",
  marketplace: "<!subteam^S09P9V09X28>",
  apps: "<!subteam^S05KCNWRDU0>",
  tech_support: "<!subteam^SS0BSE7W5543>",
} as const;

/**
 * Canal de Slack por equipo — cada uno publica en su propio canal, confirmados por el
 * usuario. `ESCALATION_SLACK_CHANNEL` sigue disponible como override global: si está
 * seteada, gana sobre el mapeo por equipo (útil para pruebas en un entorno que no deba
 * tocar los canales reales).
 */
const TEAM_CHANNELS = {
  brain: "C05SULBPMFB",
  marketplace: "C09NWTAFQAJ",
  apps: "CH58JGAAX",
  tech_support: "C018YRSQ5BR",
} as const;

const ESCALATION_CHANNEL_OVERRIDE = process.env.ESCALATION_SLACK_CHANNEL?.trim();

const TEAM_VALUES = Object.keys(TEAM_MENTIONS) as [
  keyof typeof TEAM_MENTIONS,
  ...Array<keyof typeof TEAM_MENTIONS>,
];

/** Este agente solo corre embebido en el widget — no hay otro canal posible todavía. */
const CANAL = "Widget";

export default defineTool({
  description:
    "Escala un caso/error al equipo correspondiente publicando un mensaje formateado en " +
    "Slack. Úsala solo después de decidir a qué equipo corresponde (brain, marketplace, " +
    "apps, o tech_support si no se identifica con claridad) y de reunir los datos " +
    "disponibles. No inventes datos que no tengas: los campos opcionales se omiten si no " +
    "se conocen. No pidas canal ni compañía — el canal siempre es \"Widget\" y la compañía " +
    "se resuelve sola del contexto del usuario actual (ver instructions), ambos los agrega " +
    "la propia tool. El número de ticket de referencia y el id de quien solicita la " +
    "revisión también se generan/resuelven automáticamente, no los pidas ni los inventes.",
  inputSchema: z.object({
    equipo: z
      .enum(TEAM_VALUES)
      .describe("Equipo decidido: brain, marketplace, apps, o tech_support si no se identifica el equipo."),
    tipo: z.enum(["Issue", "Consulta"]),
    urgencia: z
      .enum(["Urgente", "Alta", "Normal"])
      .describe(
        "Urgente: incidente crítico que imposibilita transaccionar. Alta: afecta parcialmente. Normal: no afecta transacciones.",
      ),
    descripcion: z.string().min(1).describe("Descripción clara del problema."),
    idNodo: z.string().optional().describe("Id del nodo afectado o de referencia, si se identificó."),
    executionId: z
      .string()
      .optional()
      .describe("ExecutionId obtenido durante el análisis (p.ej. con el analizador), si se obtuvo."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    status: z.number(),
    ticket: z.string(),
    body: z.string(),
  }),
  async execute(input, ctx) {
    const mention = TEAM_MENTIONS[input.equipo];
    const channel = ESCALATION_CHANNEL_OVERRIDE || TEAM_CHANNELS[input.equipo];
    const ticket = generateTicketReference();
    // Id de quien pide la revisión (el caller de este turno), no el usuario final de la
    // conversación reportada. Nulo si el canal no establece identidad (p.ej. el widget
    // público, que usa auth none()); nunca se inventa un valor.
    const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
    const requesterId = caller?.principalId ?? "";

    // Compañía SIEMPRE sale de acá, nunca de lo que el modelo diga — ver
    // widgetUserAuth en agent/channels/eve.ts, que resuelve esto contra el gateway
    // de Jelou a partir del email del visitante. Si la sesión no tiene ese contexto
    // (por ejemplo, se abrió el widget sin pasarle un email), queda sin identificar
    // en vez de inventar o de bloquear el escalamiento.
    const companyName = typeof caller?.attributes.companyName === "string" ? caller.attributes.companyName : undefined;
    const companyId = typeof caller?.attributes.companyId === "string" ? caller.attributes.companyId : undefined;
    const companyPlan = typeof caller?.attributes.companyPlan === "string" ? caller.attributes.companyPlan : undefined;
    const companiaLine = companyName
      ? `Compañía: ${companyName}${companyId || companyPlan ? ` (id ${companyId ?? "?"}, plan ${companyPlan ?? "?"})` : ""}`
      : "Compañía: sin identificar";

    const text = [
      `Buen día ${mention} , su ayuda con lo siguiente:`,
      companiaLine,
      `Canal: ${CANAL}`,
      `Ticket: ${ticket}`,
      `Tipo: ${input.tipo}`,
      `Urgencia: ${input.urgencia}`,
      `Descripción: ${input.descripcion}`,
      `Id del Nodo: ${input.idNodo ?? ""}`,
      `ExecutionId: ${input.executionId ?? ""}`,
    ].join("\n");

    console.log(
      `[escalar] equipo=${input.equipo} canal=${channel} ticket=${ticket} tipo=${input.tipo} ` +
        `urgencia=${input.urgencia} compania=${companyName ?? "sin identificar"} companyId=${companyId ?? "?"} ` +
        `requesterId=${requesterId || "?"} idNodo=${input.idNodo ?? ""} executionId=${input.executionId ?? ""} ` +
        `eveSessionId=${ctx.session.id}`,
    );

    const response = await fetch(SLACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        text,
        // OJO: este campo NO lleva el executionId real del análisis (ese ya va dentro
        // de `text`, en la línea "ExecutionId: ..."). Aquí va el sessionId de eve de
        // esta conversación, a pedido del equipo: su servicio persiste este payload en
        // base de datos, y cuando el equipo responda en Slack, hace la búsqueda por este
        // campo y llama a POST /api/escalations/respond con este mismo valor como
        // `sessionId` para reanudar exactamente esta sesión pausada.
        executionId: ctx.session.id,
        userId: requesterId,
      }),
      signal: ctx.abortSignal,
    });

    const body = await response.text();
    console.log(
      `[escalar] respuesta de Slack: status=${response.status} ok=${response.ok} body=${body.slice(0, 500)}`,
    );
    return { ok: response.ok, status: response.status, ticket, body: body.slice(0, 2_000) };
  },
});

/**
 * Genera un número de referencia con formato WI0001. No es un contador global
 * estrictamente secuencial (este proyecto no tiene una base de datos/KV compartida
 * entre sesiones para llevar la cuenta real) — es un identificador de referencia único
 * por escalamiento, con el formato pedido. Si se necesita numeración secuencial
 * garantizada entre todos los usuarios, hay que sumar un contador persistente externo.
 */
function generateTicketReference(): string {
  const n = Date.now() % 10_000;
  return `WI${String(n).padStart(4, "0")}`;
}
