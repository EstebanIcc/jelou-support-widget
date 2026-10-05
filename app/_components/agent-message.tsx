"use client";

import type {
  EveAuthorizationPart,
  EveDynamicToolPart,
  EveMessage,
  EveMessagePart,
} from "eve/react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  KeyRoundIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import { MessageResponse } from "@/components/ai-elements/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { RESUME_CONTEXT_MARKER_PREFIX } from "@/lib/conversation-history";
import { eveBackendUrl } from "@/lib/eve-backend-url";
import { cn } from "@/lib/utils";

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

type EveFilePart = Extract<EveMessagePart, { type: "file" }>;

type NodeProp = { readonly node?: unknown };

/**
 * Config del reveal letra-por-letra de Streamdown. Debe ser una referencia estable
 * (constante de módulo, no un objeto literal inline en el JSX) — Streamdown trae un
 * efecto interno que depende de este objeto por identidad; pasarlo inline creaba una
 * referencia nueva en cada render y disparaba un loop ("Maximum update depth exceeded").
 */
const STREAMING_ANIMATION = {
  animation: "fadeIn",
  duration: 220,
  sep: "char",
  stagger: 10,
} as const;

/**
 * Cuántas "palabras" (en realidad: fragmentos no-espacio + su espacio/salto de línea
 * siguiente, para preservar el markdown exacto al reunirlas) se revelan por tick, y cada
 * cuánto. Por qué palabras y no líneas: un párrafo de markdown suele ser UNA sola línea
 * larga en el texto crudo (sin \n adentro) — revelar por línea hacía que párrafos enteros
 * aparecieran de un solo salto, no "despacio". Por palabras, hasta un párrafo largo se ve
 * ir apareciendo de a poco.
 */
const REVEAL_WORDS_PER_TICK = 3;
const REVEAL_TICK_INTERVAL_MS = 90;

/**
 * Revela `text` de a pocas palabras por vez, a ritmo fijo, en vez de todo lo que ya
 * llegó por streaming de una sola vez. El problema de fondo del scroll (saltos,
 * entrecortado) era que el texto crece en ráfagas irregulares según cómo el proveedor
 * manda los chunks por red — chunks grandes de golpe, después nada. Acá controlamos
 * nosotros el ritmo de crecimiento del contenido (parejo, predecible), y dejamos que sea
 * `Conversation` (use-stick-to-bottom, ver components/ai-elements/conversation.tsx) el
 * que siga ese crecimiento — usa un algoritmo de resortes por velocidad en vez de
 * scroll-behavior CSS reactivo a resize, así que no se traba ni se pelea contra sí
 * mismo. Nosotros NO llamamos a ningún scrollToBottom acá: dejar que el propio
 * Conversation reaccione al crecimiento parejo del contenido es justamente lo que evita
 * los saltos raros de antes (cuando había dos mecanismos moviendo el scroll en paralelo).
 *
 * Si el mensaje ya estaba completo al montar (viene del historial, no es una respuesta
 * en curso), arranca totalmente revelado — nunca reanima texto viejo.
 */
function useProgressiveTextReveal(text: string, active: boolean) {
  // Cada elemento es una "palabra" + todo el espacio en blanco que la sigue (incluye
  // saltos de línea dobles entre párrafos, sangría de listas, etc.) — al unir los
  // primeros N elementos se reconstruye el texto original exacto hasta ese punto, sin
  // perder ni inventar espaciado.
  const chunks = text.length > 0 ? (text.match(/\S+\s*/g) ?? []) : [];
  const [revealedCount, setRevealedCount] = useState(() =>
    active ? 0 : chunks.length,
  );

  useEffect(() => {
    if (revealedCount >= chunks.length) return;
    const timer = setTimeout(() => {
      setRevealedCount((count) =>
        Math.min(count + REVEAL_WORDS_PER_TICK, chunks.length),
      );
    }, REVEAL_TICK_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [revealedCount, chunks.length]);

  return {
    isRevealing: revealedCount < chunks.length,
    visibleText: chunks.slice(0, revealedCount).join(""),
  };
}

/**
 * Streamdown envuelve toda tabla por default en dos cajas con borde + fondo
 * (una tarjeta con toolbar de copiar/descargar arriba) — se ve como una
 * burbuja flotando en el canvas. Estos overrides la reemplazan por una tabla
 * plana, integrada al flujo del texto: sin tarjeta ni fondo, solo un borde
 * bajo el encabezado y separadores sutiles entre filas (mismo patrón que el
 * resto de la plataforma de Jelou).
 */
const markdownTableComponents = {
  table: ({
    className,
    children,
    node: _node,
    ...props
  }: ComponentProps<"table"> & NodeProp) => (
    <div className="w-full min-w-0 overflow-x-auto">
      <table
        className={cn("w-full min-w-full border-collapse text-[13px]", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({
    className,
    children,
    node: _node,
    ...props
  }: ComponentProps<"thead"> & NodeProp) => (
    <thead className={className} {...props}>
      {children}
    </thead>
  ),
  tbody: ({
    className,
    children,
    node: _node,
    ...props
  }: ComponentProps<"tbody"> & NodeProp) => (
    <tbody className={cn("divide-y divide-border", className)} {...props}>
      {children}
    </tbody>
  ),
  tr: ({
    className,
    children,
    node: _node,
    ...props
  }: ComponentProps<"tr"> & NodeProp) => (
    <tr className={className} {...props}>
      {children}
    </tr>
  ),
  th: ({
    className,
    children,
    node: _node,
    ...props
  }: ComponentProps<"th"> & NodeProp) => (
    <th
      className={cn(
        "whitespace-nowrap border-b border-border px-2.5 py-1.5 text-left text-xs font-semibold text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({
    className,
    children,
    node: _node,
    ...props
  }: ComponentProps<"td"> & NodeProp) => (
    <td className={cn("px-2.5 py-1.5 align-top", className)} {...props}>
      {children}
    </td>
  ),
};

/**
 * Marcador de texto que chat-widget.tsx agrega junto a cada imagen adjunta (ver
 * handleSubmit) — no es algo que el usuario haya escrito, es una pista para que el
 * modelo pueda citar la URL real si decide escalar el caso (ver agent/tools/escalar.ts,
 * campo `imagenes`, en widget_back_end). Se manda tal cual al backend/modelo, pero en la
 * UI no tiene sentido mostrarle al usuario el link crudo que él nunca escribió — acá se
 * cuenta y se saca del texto visible, para reemplazarlo por un aviso corto sin el link.
 */
const IMAGE_ATTACHMENT_MARKER = /^\[Imagen adjunta: .+\]$/;

export function AgentMessage({
  canRespond,
  eveSessionId,
  isLatestMessage,
  isNew,
  isStreaming,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  /**
   * `session.state.sessionId` del Client de eve (ver chat-widget.tsx) — no confundir
   * con el `sessionId` de ChatWidgetProps (el de Jelou apps). Va al backend cuando se
   * manda feedback de un mensaje (ver MessageActionsRow / POST /feedback en
   * agent/channels/widget-http.ts).
   */
  readonly eveSessionId: string;
  /**
   * true si este es el último mensaje visible de la conversación. Determina si un tool
   * call "pendiente" (analizador en_progreso, o una pregunta de ask_question sin
   * responder — ver isAlwaysVisibleToolPart en ToolCallHistory) se sigue mostrando como
   * en curso: apenas existe un mensaje posterior, ya sabemos que se resolvió (el
   * analizador o el equipo de un escalamiento respondieron con un turno nuevo, ver
   * use-analizador-poll.ts y POST /escalations/respond), aunque ese tool part en
   * particular nunca se actualice in place.
   */
  readonly isLatestMessage: boolean;
  /**
   * true si el mensaje se agregó durante esta sesión (no venía ya en el historial
   * cargado al montar). Determina si el texto se revela progresivo o se muestra
   * completo de una — ver useProgressiveTextReveal más abajo para el porqué de usar esto
   * en vez de `isStreaming`.
   */
  readonly isNew: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (
    responses: readonly AgentInputResponse[],
  ) => void | Promise<void>;
}) {
  const isUser = message.role === "user";
  const align = isUser ? "end" : "start";
  const textParts = message.parts.filter((part) => part.type === "text");
  // Tool calls se agrupan aparte (ver ToolCallHistory) para poder colapsarlos en un
  // acordeón; el resto (reasoning, adjuntos, autorización) se sigue renderizando en su
  // posición normal.
  const toolParts = message.parts.filter(
    (part): part is EveDynamicToolPart => part.type === "dynamic-tool",
  );
  const otherParts = message.parts.filter(
    (part) => part.type !== "text" && part.type !== "dynamic-tool",
  );
  const imageMarkerCount = textParts.filter((part) =>
    IMAGE_ATTACHMENT_MARKER.test(part.text.trim()),
  ).length;
  // Igual que IMAGE_ATTACHMENT_MARKER: chat-widget.tsx antepone este bloque (oculto)
  // al primer mensaje nuevo después de "retomar" una conversación pasada (ver
  // pendingResumeContextRef en handleSubmit) — el agente lo necesita, el usuario nunca
  // lo escribió, así que no se muestra en la burbuja (ver hasResumeContext más abajo).
  const hasResumeContext = textParts.some((part) =>
    part.text.startsWith(RESUME_CONTEXT_MARKER_PREFIX),
  );
  const combinedText = textParts
    .filter(
      (part) =>
        !IMAGE_ATTACHMENT_MARKER.test(part.text.trim()) &&
        !part.text.startsWith(RESUME_CONTEXT_MARKER_PREFIX),
    )
    .map((part) => part.text)
    .join("");
  // Solo relevante para la respuesta del asistente (la burbuja del usuario se muestra
  // entera, sin pausas) — se llama siempre igual, sin condicionales, por las reglas de
  // hooks; para el usuario simplemente no se usa su resultado.
  const { isRevealing, visibleText } = useProgressiveTextReveal(
    combinedText,
    isNew,
  );
  const isRevealingResponse = !isUser && (isStreaming || isRevealing);

  return (
    <Message
      align={align}
      data-optimistic={message.metadata?.optimistic ? "true" : undefined}
    >
      {/* gap-1 en vez del gap-2.5 default de MessageContent: ese espacio queda igual
          de grande aunque el MessageFooter de abajo (copiar/feedback) esté invisible
          por el hover (opacity-0 reserva su alto igual, ver MessageActionsRow más
          abajo) — con el default se sentía como un salto grande entre la burbuja del
          usuario y la respuesta del agente que viene después. */}
      <MessageContent className="gap-1">
        {combinedText || imageMarkerCount > 0 || hasResumeContext ? (
          isUser ? (
            <Bubble align={align} variant="default">
              <BubbleContent className="whitespace-pre-wrap">
                {combinedText}
                {imageMarkerCount > 0 ? (
                  <span
                    className={
                      combinedText
                        ? "mt-1 block text-xs opacity-80"
                        : "text-xs opacity-80"
                    }
                  >
                    {imageMarkerCount === 1
                      ? "Imagen agregada"
                      : `${imageMarkerCount} imágenes agregadas`}
                  </span>
                ) : null}
              </BubbleContent>
            </Bubble>
          ) : (
            // Respuesta del asistente: sin burbuja, embebida en el flujo principal
            // (como el resto del contenido de la conversación), renderizada como
            // Markdown para que listas, negritas, código, etc. se vean bien.
            <div className="w-full min-w-0 text-sm text-foreground">
              <MessageResponse
                className="w-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                components={markdownTableComponents}
                // Revela letra por letra dentro de cada línea ya revelada por
                // useLineByLineReveal (ver arriba) — isAnimating en false para
                // historial ya completo evita reanimar todo de nuevo al
                // recargar/reconectar.
                animated={STREAMING_ANIMATION}
                isAnimating={isRevealingResponse}
              >
                {visibleText}
              </MessageResponse>
              {isRevealingResponse ? (
                <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle" />
              ) : null}
            </div>
          )
        ) : null}

        {/* Tareas/tools abajo del mensaje, no arriba — la respuesta del agente es lo
            primero que se lee, el detalle de qué hizo para llegar ahí queda como
            contexto secundario debajo (ver conversación de diseño). */}
        <ToolCallHistory
          canRespond={canRespond}
          isLatestMessage={isLatestMessage}
          isStreaming={isStreaming}
          onInputResponses={onInputResponses}
          parts={toolParts}
        />

        {otherParts.map((part, index) => (
          <AgentMessagePart key={partKey(part, index)} part={part} />
        ))}

        {/* Sin etiqueta de rol ("Tú"/"Jelou"/"Escribiendo…") — la posición del mensaje
            (izquierda/derecha) y el estilo ya distinguen quién habla, sin necesidad de
            repetirlo en texto. El footer ahora solo existe para las acciones
            (copiar/feedback), y solo una vez que el mensaje terminó de generarse.
            Solo para el asistente: en la burbuja del usuario el botón de copiar no
            aportaba nada (es su propio texto, recién escrito) y quedaba flotando solo,
            sin feedback al lado (showFeedback ya lo ocultaba solo para el usuario). */}
        {!isUser && !isRevealingResponse && !isStreaming && combinedText ? (
          <MessageFooter className="gap-2">
            <MessageActionsRow
              eveSessionId={eveSessionId}
              messageId={message.id}
              showFeedback={!isUser}
              text={combinedText}
              turnId={message.metadata?.turnId}
            />
          </MessageFooter>
        ) : null}
      </MessageContent>
    </Message>
  );
}

/**
 * Fila de acciones del mensaje (copiar, y para el asistente, feedback de
 * buena/mala respuesta). Solo visible al hacer hover del mensaje o con foco
 * de teclado — usa el `group/message` que ya expone <Message>.
 *
 * El feedback se manda a POST /feedback (ver agent/channels/widget-http.ts en el
 * backend, tabla `message_feedback` en ClickHouse) apenas se marca up/down — no al
 * togglear de vuelta a null, eso solo limpia el estado visual local. Fire-and-forget:
 * si falla (red, backend caído, ClickHouse sin configurar) el botón sigue funcionando
 * igual, solo no queda registrado — nunca bloquea ni le muestra un error al usuario.
 */
function MessageActionsRow({
  eveSessionId,
  messageId,
  showFeedback,
  text,
  turnId,
}: {
  readonly eveSessionId: string;
  readonly messageId: string;
  readonly showFeedback: boolean;
  readonly text: string;
  readonly turnId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"down" | "up" | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(copyTimeoutRef.current), []);

  const handleCopy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Sin permiso de portapapeles u otro fallo silencioso: no bloquea nada.
      });
  };

  const sendFeedback = (rating: "down" | "up") => {
    if (!eveSessionId) return;
    fetch(eveBackendUrl("/feedback"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: eveSessionId, messageId, turnId, rating }),
    }).catch(() => {
      // Best-effort — ver comentario de MessageActionsRow más arriba.
    });
  };

  // Antes esto animaba height (h-0 -> h-6) además de opacity para no reservar el alto
  // completo del botón mientras está invisible — pero animar el height empuja/corre el
  // mensaje siguiente en cada hover/unhover (el salto que se reportó). Ahora el alto
  // reservado queda FIJO en h-3 (la mitad del size-6 real de los botones) — bastante
  // menos que antes, así que el salto entre mensajes sigue chico — y solo se anima la
  // opacity. Sin overflow-hidden, los botones (más altos que el contenedor) sobresalen
  // centrados verticalmente al mostrarse en vez de forzar el contenedor a crecer, así
  // que nada alrededor se mueve al hacer hover/unhover.
  // Ya no lleva ml-auto: ahora MessageActionsRow solo se renderiza para la respuesta
  // del asistente (ver AgentMessage más arriba, la burbuja del usuario ya no tiene
  // footer), y el pedido fue que esa fila quede pegada a la izquierda, debajo del
  // texto, en vez de empujada al borde derecho del footer.
  return (
    <span className="flex h-3 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
      <Button
        aria-label="Copiar"
        onClick={handleCopy}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
      {showFeedback ? (
        <>
          <Button
            aria-label="Buena respuesta"
            aria-pressed={feedback === "up"}
            className={feedback === "up" ? "text-success" : undefined}
            onClick={() =>
              setFeedback((current) => {
                if (current === "up") return null;
                sendFeedback("up");
                return "up";
              })
            }
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ThumbsUpIcon />
          </Button>
          <Button
            aria-label="Mala respuesta"
            aria-pressed={feedback === "down"}
            className={feedback === "down" ? "text-destructive" : undefined}
            onClick={() =>
              setFeedback((current) => {
                if (current === "down") return null;
                sendFeedback("down");
                return "down";
              })
            }
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ThumbsDownIcon />
          </Button>
        </>
      ) : null}
    </span>
  );
}

/**
 * Un tool call queda siempre visible, afuera del acordeón colapsable, cuando terminó
 * en error, tiene una pregunta sin responder todavía, o es una investigación del
 * analizador que sigue "en_progreso" (ver "Respuesta tardía del analizador" en
 * agent/instructions.md) — son los únicos casos donde esconderlo detrás de un
 * "expandir" le tapa al usuario algo que necesita ver.
 */
function isAlwaysVisibleToolPart(part: EveDynamicToolPart, isLatestMessage: boolean): boolean {
  if (part.state === "output-error") return true;
  // "en_progreso" (analizador) y una pregunta sin `inputResponse` (ask_question,
  // incluido el usado para el ida-y-vuelta de escalamiento a Slack) solo cuentan como
  // pendientes de verdad en el ÚLTIMO mensaje visible: tanto la respuesta tardía del
  // analizador (use-analizador-poll.ts) como la del equipo en Slack (POST
  // /escalations/respond → agent/lib/eve-resume.ts) resuelven la sesión mandando un
  // turno de texto plano nuevo en vez de completar este mismo tool part — así que en
  // cuanto existe un mensaje posterior ya sabemos que se resolvió, aunque este part en
  // particular haya quedado "congelado" con su estado viejo. Sin este chequeo,
  // "Esperando respuesta..."/la pregunta sin responder se quedaban pegadas para siempre
  // en el historial aunque el agente ya hubiera contestado.
  if (!isLatestMessage) return false;
  if (getAnalizadorOutputEstado(part) === "en_progreso") return true;
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  return Boolean(inputRequest && !inputResponse);
}

/**
 * Agrupa todos los tool calls de un mensaje en un solo bloque, en vez de listarlos
 * sueltos uno debajo del otro. Por defecto se ve colapsado a una sola línea (la última
 * acción), tanto en curso como ya terminado — con el historial completo disponible al
 * expandir (con sangría). Los que necesitan atención (error, pregunta sin responder)
 * nunca se esconden.
 *
 * Importante: se mantiene colapsado *también mientras isStreaming* a propósito. Cada
 * tool call nuevo cambia el contenido del contenedor con scroll de toda la conversación
 * (Conversation, ver components/ai-elements/conversation.tsx); si en vez de una sola
 * línea se renderizara la lista completa creciendo con cada acción, cada cambio de
 * altura dispara de nuevo el auto-scroll — se sentía como que "saltaba" en cada paso del
 * agente en vez de una sola vez. Con una sola línea que solo cambia de texto (misma
 * altura), el auto-scroll no se re-dispara por cada acción.
 */
function ToolCallHistory({
  canRespond,
  isLatestMessage,
  isStreaming,
  onInputResponses,
  parts,
}: {
  readonly canRespond: boolean;
  readonly isLatestMessage: boolean;
  readonly isStreaming: boolean;
  readonly onInputResponses: (
    responses: readonly AgentInputResponse[],
  ) => void | Promise<void>;
  readonly parts: readonly EveDynamicToolPart[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (parts.length === 0) {
    return null;
  }

  const always = parts.filter((part) => isAlwaysVisibleToolPart(part, isLatestMessage));
  const collapsible = parts.filter((part) => !isAlwaysVisibleToolPart(part, isLatestMessage));
  // Mientras isStreaming, ignora el `expanded` que el usuario haya elegido: si dejamos
  // que la lista completa crezca en vivo mientras el agente sigue llamando tools, cada
  // tool call nuevo cambia la altura del bloque y eso re-dispara el auto-scroll de
  // Conversation en cada paso (justo lo que no queremos). El click en "expandir" durante
  // el streaming igual queda guardado en el estado — apenas termina, se muestra
  // expandido de una, sin más resizes intermedios mientras tanto.
  const showCollapsed = (isStreaming || !expanded) && collapsible.length > 0;
  const last = collapsible[collapsible.length - 1];

  return (
    <div className="w-full space-y-1.5">
      {always.map((part) => (
        <ToolPart
          canRespond={canRespond}
          isLatestMessage={isLatestMessage}
          key={part.toolCallId}
          onInputResponses={onInputResponses}
          part={part}
        />
      ))}

      {collapsible.length === 0 ? null : showCollapsed && last ? (
        <button
          aria-expanded={false}
          className="flex items-center gap-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setExpanded(true)}
          type="button"
        >
          <ChevronRightIcon className="size-3.5 shrink-0" />
          <span className="truncate">{getToolDisplayName(last, isLatestMessage)}</span>
          {collapsible.length > 1 ? (
            <span className="shrink-0 text-muted-foreground/70">
              · +{collapsible.length - 1} más
            </span>
          ) : null}
        </button>
      ) : (
        <div className="space-y-1.5">
          <button
            aria-expanded={true}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setExpanded(false)}
            type="button"
          >
            <ChevronDownIcon className="size-3.5 shrink-0" />
            Ocultar historial
          </button>
          <div className="space-y-1.5 border-l border-border pl-3">
            {collapsible.map((part) => (
              <ToolPart
                canRespond={canRespond}
                isLatestMessage={isLatestMessage}
                key={part.toolCallId}
                onInputResponses={onInputResponses}
                part={part}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentMessagePart({ part }: { readonly part: EveMessagePart }) {
  switch (part.type) {
    case "step-start":
    case "text":
      return null;
    case "reasoning":
      return (
        <Marker variant="border">
          <MarkerContent className={part.state === "streaming" ? "shimmer" : undefined}>
            {part.text || "Razonando…"}
          </MarkerContent>
        </Marker>
      );
    case "file":
      return <AttachmentPart part={part} />;
    case "authorization":
      return <AuthorizationPrompt part={part} />;
    case "dynamic-tool":
      // Los tool calls se agrupan y renderizan aparte, vía ToolCallHistory (ver
      // AgentMessage) — no llegan acá porque se filtran de antemano de `otherParts`.
      return null;
    default:
      return null;
  }
}

function AttachmentPart({ part }: { readonly part: EveFilePart }) {
  const label = part.filename ?? "Adjunto";
  const detail = [part.mediaType, formatBytes(part.size)]
    .filter(Boolean)
    .join(" · ");
  const isImage = part.mediaType.startsWith("image/") && part.url !== undefined;
  const Icon = isImage ? ImageIcon : FileTextIcon;

  return (
    <Attachment state="done" size="sm">
      <AttachmentMedia variant={isImage ? "image" : "icon"}>
        {isImage && part.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={label} src={part.url} />
        ) : (
          <Icon />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{label}</AttachmentTitle>
        {detail ? (
          <AttachmentDescription>{detail}</AttachmentDescription>
        ) : null}
      </AttachmentContent>
      {part.url ? (
        <AttachmentActions>
          <AttachmentAction asChild aria-label="Abrir adjunto">
            <a href={part.url} rel="noreferrer" target="_blank">
              <DownloadIcon />
            </a>
          </AttachmentAction>
        </AttachmentActions>
      ) : null}
      {part.url ? (
        <AttachmentTrigger asChild aria-label={label}>
          <a href={part.url} rel="noreferrer" target="_blank" />
        </AttachmentTrigger>
      ) : null}
    </Attachment>
  );
}

/** Estados terminales de un tool call: ya no va a cambiar más. */
function isToolCallTerminal(state: EveDynamicToolPart["state"]): boolean {
  return (
    state === "output-available" ||
    state === "output-error" ||
    state === "output-denied"
  );
}

/**
 * Mide cuánto tarda una tool call, en el propio cliente (la API no expone
 * timestamps). Solo cuenta si alcanzamos a ver la tool en un estado no
 * terminal (es decir, la vimos "en curso" nosotros mismos) — si al montar ya
 * viene terminal (p.ej. se recargó la página con historial ya resuelto), no
 * inventamos una duración falsa: simplemente no se muestra.
 */
function useToolCallDuration(state: EveDynamicToolPart["state"]): number | null {
  const startRef = useRef<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const terminal = isToolCallTerminal(state);

  if (startRef.current === null && !terminal) {
    startRef.current = Date.now();
  }

  useEffect(() => {
    if (terminal && durationMs === null && startRef.current !== null) {
      setDurationMs(Date.now() - startRef.current);
    }
  }, [terminal, durationMs]);

  return durationMs;
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/**
 * Nombres legibles para las tools propias (ver widget_back_end/agent/tools/*.ts) y para el `ask_question`
 * built-in de eve. Cualquier tool nueva que no esté acá cae en `humanizeToolName` (snake/
 * kebab-case → "Palabra Palabra") en vez de mostrar la key técnica cruda.
 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  ask_question: "Preguntando",
  escalar: "Escalando el caso",
  read_jelou_docs: "Leyendo la documentación",
  search_jelou_docs: "Buscando en la documentación",
};

/** Nombres legibles para skills cargados (ver agent/skills/*), keyed por el nombre de carpeta. */
const SKILL_DISPLAY_NAMES: Record<string, string> = {
  analizador: "Cargando guía del analizador",
  "escalar-apps": "Cargando guía de escalamiento (Apps)",
  "escalar-brain": "Cargando guía de escalamiento (Brain)",
  "escalar-marketplace": "Cargando guía de escalamiento (Marketplace)",
};

function humanizeToolName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * El analizador (widget_back_end/agent/tools/analizador.ts) delega en jelou-ops-support-chat, así que el
 * tool call en sí siempre termina rápido ("output-available") aunque la investigación de
 * fondo siga sin resolverse — el propio output trae `estado: "en_progreso"` en ese caso
 * (ver agent/instructions.md, "Respuesta tardía del analizador"). Sin esto, la UI
 * mostraría "listo" mientras en realidad la respuesta real todavía puede tardar minutos.
 */
function getAnalizadorOutputEstado(part: EveDynamicToolPart): string | undefined {
  if (part.state !== "output-available") return undefined;
  const output = part.output;
  if (typeof output !== "object" || output === null || !("estado" in output)) {
    return undefined;
  }
  const estado = (output as { estado: unknown }).estado;
  return typeof estado === "string" ? estado : undefined;
}

/**
 * Ticket (formato WI####, ver widget_back_end/agent/lib/ticket.ts) de la investigación
 * del analizador en curso — lo único que el output trae todavía mientras `estado` es
 * "en_progreso" (ver agent/tools/analizador.ts, outputSchema). Usado para el detalle que
 * se despliega al expandir esa fila (ver ToolPart, `analizadorPending`/`showDetail` más
 * abajo) — antes esa fila no tenía nada para expandir mientras seguía en curso.
 */
function getAnalizadorTicket(part: EveDynamicToolPart): string | undefined {
  if (part.state !== "output-available") return undefined;
  const output = part.output;
  if (typeof output !== "object" || output === null || !("ticket" in output)) {
    return undefined;
  }
  const ticket = (output as { ticket: unknown }).ticket;
  return typeof ticket === "string" ? ticket : undefined;
}

function getAnalizadorDisplayName(part: EveDynamicToolPart, isLatestMessage: boolean): string {
  // "Investigando" (gerundio) se sentía contradictorio combinado con el sufijo " ·
  // listo" que agrega ToolPart más abajo una vez resuelto (ver analizadorPending ahí) —
  // parecía que el estado nunca se actualizaba ("Investigando · listo" lee como si
  // siguiera en curso). "Investigación" es un sustantivo neutro, igual que el resto de
  // las etiquetas de este archivo ("Cargando guía...", "Delegando a..."), así que
  // combinado con ese sufijo queda "Investigación · listo" sin la contradicción.
  return isLatestMessage && getAnalizadorOutputEstado(part) === "en_progreso"
    ? "Esperando respuesta de la investigación"
    : "Investigación";
}

/**
 * Nombre visible de un dynamic-tool part: prioriza el mapeo humano por kind (tool call,
 * skill cargado, subagente); si no hay mapeo explícito, humaniza la key en vez de
 * mostrarla cruda — nunca se ve un "search_jelou_docs" o "escalar-brain" tal cual.
 */
export function getToolDisplayName(part: EveDynamicToolPart, isLatestMessage: boolean): string {
  const eveMeta = part.toolMetadata?.eve;
  const name = eveMeta?.name ?? part.toolName;

  if (eveMeta?.kind === "load-skill") {
    return SKILL_DISPLAY_NAMES[name] ?? `Cargando guía: ${humanizeToolName(name)}`;
  }
  if (eveMeta?.kind === "subagent-call") {
    return `Delegando a ${humanizeToolName(name)}`;
  }
  if (name === "analizador") {
    return getAnalizadorDisplayName(part, isLatestMessage);
  }
  return TOOL_DISPLAY_NAMES[name] ?? humanizeToolName(name);
}

/**
 * True si un dynamic-tool part sigue "en curso" ahora mismo — incluye el caso especial
 * del analizador, que devuelve `output-available` en cuanto jelou-ops-support-chat
 * confirma recibido el mensaje, aunque la investigación real (estado "en_progreso" en el
 * output) pueda seguir corriendo minutos más (ver getAnalizadorOutputEstado arriba).
 * Compartido entre ToolPart (para el shimmer de cada fila) y getActiveToolLabel (para el
 * indicador "el agente está trabajando" de ChatWidget/AgentChat).
 */
export function isToolPartRunning(part: EveDynamicToolPart, isLatestMessage: boolean): boolean {
  if (!isLatestMessage) return false;
  return (
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    getAnalizadorOutputEstado(part) === "en_progreso"
  );
}

/**
 * Nombre legible de la tool que está corriendo AHORA MISMO en el último mensaje del
 * historial, si hay alguna — usado por el indicador "el agente está trabajando" (ver
 * components/use-active-tool-label.ts) para que ese texto refleje lo que el agente
 * realmente está haciendo (buscando docs, investigando con el analizador, escalando a
 * Slack…) en vez de un texto fijo siempre igual. `undefined` cuando el último mensaje no
 * tiene ningún dynamic-tool part en curso — por ejemplo, el modelo todavía no decidió
 * llamar ninguna tool en este turno, o va a responder directo sin tools — el llamador
 * debe mostrar un texto neutro de respaldo en ese caso.
 */
export function getActiveToolLabel(messages: readonly EveMessage[]): string | undefined {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return undefined;

  const toolParts = lastMessage.parts.filter(
    (part): part is EveDynamicToolPart => part.type === "dynamic-tool",
  );
  for (let i = toolParts.length - 1; i >= 0; i--) {
    // getActiveToolLabel siempre mira el último mensaje real (ver arriba), así que acá
    // isLatestMessage es true por construcción.
    if (isToolPartRunning(toolParts[i], true)) return getToolDisplayName(toolParts[i], true);
  }
  return undefined;
}

function ToolPart({
  canRespond,
  isLatestMessage,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly isLatestMessage: boolean;
  readonly onInputResponses: (
    responses: readonly AgentInputResponse[],
  ) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  // El analizador puede terminar el tool call ("output-available") con la investigación
  // real todavía sin resolver (estado "en_progreso" — ver getAnalizadorOutputEstado más
  // abajo). En ese caso lo tratamos como si siguiera en curso: shimmer encendido y
  // sufijo "en curso" en vez de "listo", aunque técnicamente el llamado ya respondió —
  // pero solo mientras este sea el último mensaje (ver isAlwaysVisibleToolPart más
  // arriba): una vez que el analizador o un escalamiento responden, la sesión sigue con
  // un mensaje nuevo y este part queda mostrado como resuelto en vez de "en curso" para
  // siempre.
  const analizadorPending = isLatestMessage && getAnalizadorOutputEstado(part) === "en_progreso";
  const running = isToolPartRunning(part, isLatestMessage);
  const durationMs = useToolCallDuration(part.state);
  // Mientras la investigación del analizador sigue en curso, esta fila se queda SIEMPRE
  // visible (ver isAlwaysVisibleToolPart más arriba) en vez de esconderse en el
  // acordeón de ToolCallHistory — pero eso la dejaba sin ninguna forma de interactuar
  // con ella (el usuario reportó justo esto: "el panel de investigación no es
  // interactuable" mientras está buscando). El output todavía no trae nada de detalle
  // real (ver agent/tools/analizador.ts) salvo el ticket, así que acá solo se agrega un
  // toggle local para mostrarlo — no hace falta esperar a que termine para poder
  // desplegar algo.
  const [showDetail, setShowDetail] = useState(false);
  const analizadorTicket = analizadorPending ? getAnalizadorTicket(part) : undefined;

  const markerContent = (
    <>
      <MarkerIcon>
        <FileIcon />
      </MarkerIcon>
      <MarkerContent className={running ? "shimmer" : undefined}>
        {getToolDisplayName(part, isLatestMessage)}
        {analizadorPending
          ? " · en curso"
          : part.state === "output-available"
            ? " · listo"
            : part.state === "output-error"
              ? " · error"
              : " · en curso"}
        {durationMs !== null ? ` · ${formatDuration(durationMs)}` : null}
      </MarkerContent>
      {analizadorPending ? (
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
            showDetail && "rotate-90",
          )}
        />
      ) : null}
    </>
  );

  return (
    <div className="w-full max-w-[90%] space-y-2">
      {analizadorPending ? (
        <Marker asChild role="status" variant="default">
          <button
            aria-expanded={showDetail}
            className="transition-colors hover:text-foreground"
            onClick={() => setShowDetail((value) => !value)}
            type="button"
          >
            {markerContent}
          </button>
        </Marker>
      ) : (
        <Marker role="status" variant="default">
          {markerContent}
        </Marker>
      )}
      {analizadorPending && showDetail ? (
        <p className="pl-6 text-xs text-muted-foreground">
          {analizadorTicket ? `Ticket ${analizadorTicket}. ` : ""}
          Puede tardar hasta 10 minutos — te avisamos acá mismo apenas tengamos
          respuesta.
        </p>
      ) : null}
      <InputRequestActions
        canRespond={canRespond}
        onInputResponses={onInputResponses}
        part={part}
      />
      {part.errorText ? (
        <Bubble align="start" variant="destructive">
          <BubbleContent className="flex items-start gap-2">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span className="whitespace-pre-wrap">{part.errorText}</span>
          </BubbleContent>
        </Bubble>
      ) : null}
    </div>
  );
}

function AuthorizationPrompt({ part }: { readonly part: EveAuthorizationPart }) {
  const isAuthorized =
    part.state === "completed" && part.outcome === "authorized";
  const isCompleted = part.state === "completed";
  const Icon = isAuthorized
    ? CheckCircleIcon
    : isCompleted
      ? XCircleIcon
      : KeyRoundIcon;

  return (
    <div
      className={cn(
        "w-full max-w-sm space-y-3 rounded-xl border p-3",
        isAuthorized
          ? "border-success/30 bg-success/5"
          : isCompleted
            ? "border-destructive/30 bg-destructive/5"
            : "border-primary/30 bg-primary/5",
      )}
    >
      <Marker>
        <MarkerIcon>
          <Icon />
        </MarkerIcon>
        <MarkerContent>{authorizationTitle(part)}</MarkerContent>
      </Marker>
      <p className="text-sm text-muted-foreground">
        {authorizationDescription(part)}
      </p>
      {part.state === "required" && part.authorization?.url ? (
        <Button asChild size="sm">
          <a href={part.authorization.url} rel="noreferrer" target="_blank">
            <ExternalLinkIcon />
            Conectar {part.displayName}
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function authorizationTitle(part: EveAuthorizationPart): string {
  if (part.state === "required") {
    return `Conectar ${part.displayName}`;
  }
  if (part.outcome === "authorized") {
    return `${part.displayName} conectado`;
  }
  return `${part.displayName}: ${formatAuthorizationOutcome(part.outcome)}`;
}

function authorizationDescription(part: EveAuthorizationPart): string {
  if (part.state === "required") {
    return part.description;
  }
  if (part.outcome === "authorized") {
    return `${part.displayName} conectado.`;
  }
  const tail = part.reason !== undefined ? ` (${part.reason})` : "";
  return `${part.displayName} ${formatAuthorizationOutcome(part.outcome)}${tail}.`;
}

function formatAuthorizationOutcome(
  outcome: NonNullable<EveAuthorizationPart["outcome"]>,
): string {
  switch (outcome) {
    case "authorized":
      return "autorizado";
    case "declined":
      return "rechazado";
    case "failed":
      return "falló";
    case "timed-out":
      return "expiró";
  }
}

function formatBytes(size: number | undefined): string | undefined {
  if (size === undefined) {
    return undefined;
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function InputRequestActions({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (
    responses: readonly AgentInputResponse[],
  ) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId,
  );

  // La pregunta se lee como texto normal, parte del mismo canvas que la respuesta
  // del agente. Las opciones sí usan el Button del sistema de componentes (variant
  // "outline", size "sm") para que se lean claramente como acciones clicables, en
  // vez del link de texto plano que tenían antes.
  return (
    <div className="space-y-2 text-sm text-foreground">
      <p>{inputRequest.prompt}</p>
      {inputResponse ? (
        <p className="text-muted-foreground">
          Elegiste:{" "}
          <span className="font-medium text-foreground">
            {selectedOption?.label ?? inputResponse.text ?? inputResponse.optionId}
          </span>
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {inputRequest.options?.map((option) => (
            <Button
              className={
                option.style === "danger"
                  ? "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  : undefined
              }
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onInputResponses([
                  {
                    optionId: option.id,
                    requestId: inputRequest.requestId,
                  },
                ]);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "authorization":
      return `authorization:${part.turnId}:${part.stepIndex}:${part.name}`;
    case "dynamic-tool":
      return part.toolCallId;
    default:
      return `${part.type}:${index}`;
  }
}
