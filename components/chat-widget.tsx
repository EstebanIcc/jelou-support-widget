"use client";

import type { HandleMessageStreamEvent } from "eve/client";
import { Client } from "eve/client";
import type { EveDynamicToolPart, EveMessage } from "eve/react";
import { useEveAgent } from "eve/react";
import type { UserContent } from "ai";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  HistoryIcon,
  Loader2Icon,
  MessageCircleIcon,
  MicIcon,
  PaperclipIcon,
  SendIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { AgentMessage } from "@/app/_components/agent-message";
import { JelouIsotype } from "@/components/ui/jelou-isotype";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button as JouButton } from "@/components/jelou/button";
import { Button } from "@/components/ui/button";
import { ChatAttachmentList } from "@/components/chat-attachment-list";
import { ConversationList } from "@/components/conversation-list";
import {
  ATTACHMENT_ACCEPT,
  useChatAttachments,
} from "@/components/use-chat-attachments";
import {
  clearPersistedChat,
  readPersistedChat,
  useEveChatWatcher,
  writePersistedChat,
} from "@/components/use-eve-chat-sync";
import { ANALIZADOR_REPLY_PREFIX, isAnalizadorReplyMessage } from "@/lib/analizador-reply";
import {
  buildResumeContextMessage,
  fetchConversationTranscript,
  fetchRecentConversations,
  RESUME_CONTEXT_MARKER_PREFIX,
  type ConversationSummary,
  type ConversationTranscriptMessage,
} from "@/lib/conversation-history";
import { ESCALATION_REPLY_PREFIX, isEscalationReplyMessage } from "@/lib/escalation";
import { useAnalizadorPoll } from "@/components/use-analizador-poll";
import { useActiveToolLabel } from "@/components/use-active-tool-label";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Message, MessageContent } from "@/components/ui/message";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";

type CancellationState = "idle" | "requested" | "cancelling";

type Cancellation = {
  requested: boolean;
  sentTurnId?: string;
  turnId?: string;
};

// Mensaje de error "bien manejado" (ver punch list) = nunca el texto crudo que devuelve
// eve/fetch (ej. "Failed to fetch", códigos internos tipo "gateway-timeout: ...") — eso
// queda solo en consola para debug. Acá se mapea a algo que un usuario del widget pueda
// entender, distinguiendo el único caso realmente distinto: sin conexión/no llegó al
// servidor vs. cualquier otra falla del turno.
function toFriendlyErrorMessage(error: Error): string {
  const raw = error.message ?? "";
  if (/failed to fetch|network ?error|load failed|internet_disconnected|net::err_/iu.test(raw)) {
    return "No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.";
  }
  return "Ocurrió un problema al procesar tu mensaje. Intentá de nuevo en un momento.";
}

/**
 * Convierte el transcript (ClickHouse, vía fetchConversationTranscript) en objetos con
 * la forma de EveMessage, para poder renderizar el historial con el mismo AgentMessage
 * que usa la conversación en vivo — en vez del Bubble/Marker a mano que había antes, que
 * no mostraba tool calls ni markdown. Ver getConversationTranscript en
 * widget_back_end/agent/lib/clickhouse.ts y el doc del proyecto
 * "historial-conversaciones-fidelidad-visual.md" para el porqué completo.
 *
 * Conversaciones de antes de este cambio no tienen el output de sus tool calls
 * guardado — esas tool calls igual se muestran (con su nombre), solo que sin el
 * detalle que depende del output (p.ej. el estado especial del analizador).
 */
function buildHistoricalMessages(
  messages: readonly ConversationTranscriptMessage[],
): EveMessage[] {
  return messages.map((message, index) => {
    const toolParts: EveDynamicToolPart[] = message.toolCalls.map((call, callIndex) => {
      const toolCallId = call.toolCallId || `historical-${message.turnId}-${callIndex}`;
      if (call.isError) {
        const errorText =
          typeof call.output === "string"
            ? call.output
            : call.output
              ? JSON.stringify(call.output)
              : "Ocurrió un error.";
        return {
          type: "dynamic-tool",
          toolCallId,
          toolName: call.toolName,
          state: "output-error",
          input: undefined,
          errorText,
        };
      }
      return {
        type: "dynamic-tool",
        toolCallId,
        toolName: call.toolName,
        state: "output-available",
        input: undefined,
        output: call.output ?? {},
      };
    });

    return {
      id: `historical-${message.turnId}-${message.role}-${index}`,
      role: message.role === "user" ? "user" : "assistant",
      parts: [{ type: "text", text: message.content }, ...toolParts],
      metadata: { turnId: message.turnId, status: "complete" },
    };
  });
}

export type ChatWidgetProps = {
  title?: string;
  subtitle?: string;
  /**
   * Correo del visitante, si el sitio que embebe el widget ya lo conoce (ver data-email
   * en public/widget-loader.js, o pasalo directo si renderizás <ChatWidget> vos mismo).
   * Se manda como header en cada request a eve — nunca como argumento del modelo — y
   * `agent/channels/eve.ts` lo resuelve server-side contra el gateway de Jelou para saber
   * nombre y compañía sin pedírselos al usuario (ver agent/instructions/user-context.ts).
   * Si no se pasa, el widget funciona igual, solo que de forma anónima.
   */
  email?: string;
  /**
   * Nombre de pila del visitante, si ya se conoce (ver app/widget/page.tsx y app/page.tsx,
   * que lo resuelven server-side con el mismo email vía widget_back_end/agent/lib/jelou-gateway.ts). Solo
   * se usa para el saludo inicial en la UI — no viaja a eve ni al modelo por acá; ese
   * contexto lo resuelve el agente por su cuenta a partir del header `email` (ver prop de
   * arriba). Si no se pasa, el saludo queda genérico, sin nombre.
   */
  name?: string;
  /**
   * Id de sesión que genera la página que embebe el widget (Jelou apps), pasado junto al
   * correo (ver data-session-id en public/widget-loader.js). No es el session.id interno
   * de eve — viaja como header a agent/channels/eve.ts, que lo guarda en
   * attributes.sessionId para que agent/sandbox.ts lo use, junto al companyId ya resuelto,
   * al pedir el api-key dinámico del CLI (ver widget_back_end/agent/lib/support-widget-service.ts). Sin
   * este dato el analizador queda inutilizable para esa sesión, pero el chat funciona
   * igual.
   */
  sessionId?: string;
};

// Exportado para que páginas de prueba (ver home-experience.tsx) puedan limpiar el
// chat persistido al forzar una sesión nueva — por ejemplo, al cambiar el sessionId
// de prueba para validar el flujo de api-key dinámico del CLI.
export const STORAGE_KEY = "jelou-eve-agent:widget-chat";

// Paleta tomada de los tokens reales de Jelou (--jou-* del design system
// Cortex, ver components_2.rar). Alcance: solo la carcasa del widget (fondo,
// bordes, acentos, input) — los mensajes en sí conservan su render actual
// (burbuja / markdown inline), solo recoloreados vía CSS con scope al widget
// (ver <style> más abajo). El acento (teal, botones/íconos) y la burbuja de
// usuario (navy) son tokens distintos en Jelou — no se pisan entre sí.
const JELOU_VARS = {
  "--widget-paper": "#FFFFFF", // --jou-surface-background-color
  "--widget-border": "#DCDEE4", // --jou-border-color
  "--widget-border-soft": "#F1F3F5", // --jou-border-soft-color
  "--widget-text": "#303B56", // --jou-on-surface-text-color
  "--widget-text-muted": "#727C94", // --jou-help-text-color
  "--widget-text-faint": "#B0B6C2", // --jou-input-placeholder-text-color
  "--widget-accent": "#00B3C7", // --jou-primary-color
  "--widget-accent-tint": "#E0F6F8", // --jou-primary-color ~12% sobre blanco
  "--widget-accent-foreground": "#FFFFFF", // --jou-on-primary-text-color
  "--widget-bubble": "#374361", // --jou-bubble-background
  "--widget-bubble-foreground": "#FFFFFF", // --jou-bubble-foreground
  "--widget-success": "#0D8F61", // --jou-semantic-success-200
} as CSSProperties;

/**
 * Wrapper que posee lo que debe sobrevivir a un remount de la conversación:
 * si el panel está abierto/cerrado, y el watcher de reconexión (ver
 * use-eve-chat-sync.ts). Cuando el watcher detecta actividad server-side
 * externa a esta pestaña —el caso que nos interesa: la respuesta de un
 * equipo a un escalamiento— fuerza un remount de ChatWidgetInner vía `key`,
 * que vuelve a leer localStorage ya actualizado. Sin este wrapper, ese
 * remount cerraría el panel de golpe.
 */
export function ChatWidget({
  title = "Asistente Jelou",
  subtitle,
  email,
  name,
  sessionId,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  // Aviso "el agente respondió" con el panel minimizado (ver AgentReplyToast más abajo):
  // el iframe necesita agrandarse un toque para que la burbuja no quede recortada por
  // public/widget-loader.js, que por defecto solo reserva 88x88 (el botón solo).
  const [peek, setPeek] = useState(false);
  const { generation, reportIdle } = useEveChatWatcher(STORAGE_KEY);

  // Cuando corre embebido en un <iframe> (ver app/widget/page.tsx +
  // public/widget-loader.js), avisa a la página que lo contiene si el panel está
  // abierto o cerrado (o si hay un aviso de respuesta asomando con el panel cerrado),
  // para que el loader pueda redimensionar el iframe: chico (solo el botón) cuando está
  // cerrado, un poco más alto mientras se ve el aviso, grande (botón + panel) abierto.
  useEffect(() => {
    if (typeof window === "undefined" || window.self === window.top) return;
    window.parent.postMessage(
      { source: "jelou-widget", type: "resize", open, peek },
      "*",
    );
  }, [open, peek]);

  // Control desde la página que embebe el widget (ver window.JelouWidget en
  // public/widget-loader.js): abrir/cerrar el panel sin que el usuario toque el botón
  // flotante. El loader manda { source: "jelou-widget-host", type: "open" | "close" |
  // "toggle" } al iframe; solo se aceptan mensajes que vengan de la ventana padre
  // (event.source) — no se puede validar el origen porque cualquier sitio puede embeber
  // el widget, pero lo peor que un mensaje así puede hacer es abrir/cerrar el panel.
  // Al terminar de montar avisa { type: "ready" } para que el loader suelte lo que haya
  // quedado pendiente (p.ej. un open() llamado antes de que el iframe cargara).
  useEffect(() => {
    if (typeof window === "undefined" || window.self === window.top) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as { source?: unknown; type?: unknown } | null;
      if (!data || data.source !== "jelou-widget-host") return;
      if (data.type === "open") setOpen(true);
      else if (data.type === "close") setOpen(false);
      else if (data.type === "toggle") setOpen((prev) => !prev);
    };
    window.addEventListener("message", handleMessage);
    window.parent.postMessage({ source: "jelou-widget", type: "ready" }, "*");
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <ChatWidgetInner
      key={generation}
      email={email}
      // Solo el primer montaje real (carga de página) anima el scroll inicial de
      // Conversation. Un remount con generation > 0 lo dispara el watcher de
      // use-eve-chat-sync.ts al detectar una respuesta externa (ej. el equipo
      // respondiendo un escalamiento vía POST /escalations/respond) — ahí el usuario
      // ya está viendo la conversación, así que animar un scroll "smooth" hace que se
      // vea como si la página se fuera arriba y después volviera. Con "instant" el
      // remount reubica el scroll al fondo sin ese salto visible.
      initialScroll={generation === 0 ? "smooth" : "instant"}
      name={name}
      onPeekChange={setPeek}
      open={open}
      reportIdle={reportIdle}
      sessionId={sessionId}
      setOpen={setOpen}
      subtitle={subtitle}
      title={title}
    />
  );
}

function ChatWidgetInner({
  email,
  initialScroll,
  name,
  onPeekChange,
  open,
  reportIdle,
  sessionId,
  setOpen,
  subtitle,
  title,
}: ChatWidgetProps & {
  readonly initialScroll: "instant" | "smooth";
  readonly onPeekChange: (peek: boolean) => void;
  readonly open: boolean;
  readonly reportIdle: (idle: boolean) => void;
  readonly setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const [saved] = useState(() => readPersistedChat(STORAGE_KEY));
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Último mensaje mandado (texto o adjuntos), para poder reintentarlo con un clic si el
  // turno termina en error en vez de obligar a retipear todo — ver handleRetry más abajo.
  const lastSendRef = useRef<{ message: string | UserContent } | null>(null);
  const {
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    clearError: clearAttachmentError,
    error: attachmentError,
    isRecording,
    toggleRecording,
  } = useChatAttachments();

  // Vista "Mensajes" (lista de conversaciones de los últimos 7 días, tipo Intercom) —
  // ver el botón del header más abajo y ConversationList. Solo tiene sentido si hay
  // `email` (GET /conversations necesita identificar al visitante, igual que el resto
  // del chat — ver lib/conversation-history.ts).
  const [view, setView] = useState<"chat" | "list">("chat");
  const [conversations, setConversations] = useState<
    readonly ConversationSummary[]
  >([]);
  const [conversationsStatus, setConversationsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  // sessionId (no email) de la conversación pasada que se está cargando en este
  // momento al hacer click en la lista — deshabilita la lista mientras tanto (ver
  // ConversationList) y distingue "cargando esta fila" de "cargando la lista".
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(
    null,
  );
  // Transcript (solo texto) de la conversación elegida, para mostrarlo como historial
  // de solo lectura arriba de la conversación nueva (ver ConversationContent más
  // abajo) — se arma una sesión de eve nueva porque una sesión "completed" no se puede
  // reabrir (ver node_modules/eve/docs/guides/client/continuations.mdx, "Waiting,
  // completed, and failed sessions"), así que esto es la única forma de que el
  // historial viejo siga visible.
  const [resumedTranscript, setResumedTranscript] = useState<
    readonly ConversationTranscriptMessage[] | null
  >(null);
  // sessionId de la conversación retomada — para que el feedback (ver
  // MessageActionsRow, que manda eveSessionId al dar thumbs up/down) quede asociado a
  // la sesión real de esos mensajes, no a la sesión nueva que arranca al retomar.
  const [resumedSessionId, setResumedSessionId] = useState<string | null>(null);
  // Mismos objetos EveMessage que arma useEveAgent para la conversación en vivo (ver
  // buildHistoricalMessages más arriba) — así el historial se renderiza con el mismo
  // AgentMessage, en vez de un render aparte y más simple.
  const historicalMessages = useMemo(
    () => (resumedTranscript ? buildHistoricalMessages(resumedTranscript) : []),
    [resumedTranscript],
  );
  // Bloque de contexto oculto (ver buildResumeContextMessage) pendiente de anteponer
  // al PRÓXIMO mensaje que el usuario escriba — no se manda solo al elegir la
  // conversación porque eso sería un turno que el usuario nunca pidió; se agrega recién
  // cuando él mismo decide seguir escribiendo (ver handleSubmit).
  const pendingResumeContextRef = useRef<string | undefined>(undefined);

  // La lista viene de ClickHouse (vía el backend) y la primera consulta después de un
  // rato sin uso puede tardar bastante (servicio ocioso despertando / función en frío).
  // Dos cosas para que el usuario no lo sufra:
  //  - se pide apenas se ABRE el panel (ver el efecto de abajo), no recién al tocar el
  //    botón de historial, así que cuando llega a la lista ya suele estar cargada;
  //  - "stale-while-revalidate": si ya hay una lista cargada, volver a pedirla no vuelve
  //    a mostrar el spinner ni la borra si falla — se sigue viendo la anterior mientras
  //    se refresca por detrás. El spinner/error solo aparece mientras no hubo ninguna
  //    carga exitosa todavía.
  // Pedidos simultáneos (el prefetch todavía en vuelo + el click) comparten la misma
  // promesa en vez de lanzar dos consultas.
  const conversationsLoadedRef = useRef(false);
  const conversationsInFlightRef = useRef<Promise<void> | null>(null);

  const loadConversations = useCallback((): Promise<void> => {
    if (!email) return Promise.resolve();
    if (conversationsInFlightRef.current) return conversationsInFlightRef.current;
    if (!conversationsLoadedRef.current) setConversationsStatus("loading");
    const request = (async () => {
      try {
        const items = await fetchRecentConversations(email);
        conversationsLoadedRef.current = true;
        setConversations(items);
        setConversationsStatus("ready");
      } catch (error) {
        console.error(
          "[jelou-widget] no se pudieron cargar las conversaciones anteriores:",
          error,
        );
        if (!conversationsLoadedRef.current) setConversationsStatus("error");
      } finally {
        conversationsInFlightRef.current = null;
      }
    })();
    conversationsInFlightRef.current = request;
    return request;
  }, [email]);

  // Prefetch silencioso: una sola vez, la primera vez que el panel se abre con `email`.
  const conversationsPrefetchedRef = useRef(false);
  useEffect(() => {
    if (!open || !email || conversationsPrefetchedRef.current) return;
    conversationsPrefetchedRef.current = true;
    void loadConversations();
  }, [open, email, loadConversations]);

  const openConversationList = () => {
    setView("list");
    void loadConversations();
  };

  const handleSelectConversation = async (sessionId: string) => {
    if (!email || resumingSessionId) return;
    setResumingSessionId(sessionId);
    try {
      const rawMessages = await fetchConversationTranscript(sessionId, email);
      // Si esta conversación ya se había retomado antes, el bloque oculto que
      // handleSubmit le antepuso a aquel primer mensaje (ver más abajo) quedó
      // persistido en ClickHouse como un mensaje más — widget_back_end/agent/hooks/persist-analytics.ts
      // registra el contenido tal cual se lo manda a eve, sin distinguir texto oculto
      // de texto real. Sin este filtro aparecía como una burbuja con el dump crudo
      // ("[Contexto de conversación anterior]\nUsuario: ...\nAgente: ...") en vez de
      // verse como una conversación real — y si se volvía a usar para construir el
      // contexto del próximo resume, cada resume sucesivo anidaba el dump del
      // anterior adentro del nuevo, cada vez más grande.
      // Además del contexto de resume, el transcript persistido en ClickHouse incluye
      // cualquier otro turno "user" sintético que la UI en vivo esconde (ver
      // visibleMessages más abajo): la respuesta tardía del analizador
      // (ANALIZADOR_REPLY_PREFIX) y la respuesta de un escalamiento
      // (ESCALATION_REPLY_PREFIX). Sin filtrarlos aquí también, el historial
      // retomado los mostraba como si el usuario los hubiera escrito — pasaba en
      // cualquier conversación con uno de estos turnos, sin importar qué tan vieja
      // fuera ni si tenía o no la metadata de tool_result.
      const messages = rawMessages.filter(
        (message) =>
          !message.content.startsWith(RESUME_CONTEXT_MARKER_PREFIX) &&
          !message.content.startsWith(ANALIZADOR_REPLY_PREFIX) &&
          !message.content.startsWith(ESCALATION_REPLY_PREFIX),
      );
      // Antes de mostrar el historial elegido, se limpia la conversación en curso que
      // estaba cacheada (en memoria y en localStorage, ver use-eve-chat-sync.ts) — si
      // no, visibleMessages (los mensajes "vivos" de la sesión actual, ver más abajo)
      // seguían renderizándose debajo del historial nuevo, y como son los más
      // recientes/los que quedan a la vista, en la práctica tapaban la conversación
      // que se acababa de elegir y parecía que no había pasado nada. agent.reset() no
      // toca la sesión de eve en sí (sigue siendo la misma, con su propio cursor del
      // lado del servidor — eso es justamente lo que permite retomarla con contexto
      // más abajo en handleSubmit), solo vacía lo que se está mostrando en pantalla.
      clearPersistedChat(STORAGE_KEY);
      agent.reset();
      prepareTurn();
      setResumedTranscript(messages);
      setResumedSessionId(sessionId);
      pendingResumeContextRef.current = buildResumeContextMessage(messages);
      setView("chat");
    } catch (error) {
      console.error(
        "[jelou-widget] no se pudo cargar la conversación anterior:",
        error,
      );
    } finally {
      setResumingSessionId(null);
    }
  };

  // Botón "Hacer una pregunta" en el footer de la lista de conversaciones (ver
  // ConversationList más abajo) — mismo tipo de limpieza que handleSelectConversation
  // (vaciar lo que esté cacheado/mostrado), pero sin cargar ningún transcript: deja la
  // vista "chat" lista para un mensaje nuevo, sin el overlay de "Conversación anterior"
  // ni el contexto oculto de un resume pendiente, por si el usuario entró a la lista
  // desde una conversación retomada.
  const handleStartNewConversation = () => {
    if (resumingSessionId) return;
    clearPersistedChat(STORAGE_KEY);
    agent.reset();
    prepareTurn();
    setResumedTranscript(null);
    setResumedSessionId(null);
    pendingResumeContextRef.current = undefined;
    setView("chat");
    inputRef.current?.focus();
  };

  // El header con el email va acá, en el Client que arma la sesión — no en las opciones
  // de useEveAgent más abajo. EveAgentStore solo aplica su propio `headers`/`auth` cuando
  // ES ELLA quien construye el Client internamente; si le pasamos un `session` ya armado
  // (como acá, para poder cancelar turnos vía `session.cancel`), esas opciones se ignoran
  // por completo — el header nunca llegaba a `agent/channels/eve.ts` con la versión
  // anterior, por eso el agente no tenía ni idea de quién preguntaba.
  const [session] = useState(() =>
    new Client({
      headers:
        email || sessionId
          ? {
              ...(email ? { "x-jelou-user-email": email } : {}),
              ...(sessionId ? { "x-jelou-session-id": sessionId } : {}),
            }
          : undefined,
      // Backend separado (ver widget_back_end/): antes era same-origin ("").
      host: process.env.NEXT_PUBLIC_EVE_BACKEND_URL ?? "",
      preserveCompletedSessions: true,
    }).session(saved.session),
  );
  const cancellationRef = useRef<Cancellation>({ requested: false });
  const [cancellationError, setCancellationError] = useState<string>();
  const [cancellationState, setCancellationState] =
    useState<CancellationState>("idle");

  const cancelTurn = useCallback(
    (turnId: string) => {
      const cancellation = cancellationRef.current;
      if (!cancellation.requested || cancellation.sentTurnId === turnId) {
        return;
      }

      cancellation.sentTurnId = turnId;
      setCancellationState("cancelling");

      void session.cancel({ turnId }).catch((error: unknown) => {
        if (cancellationRef.current !== cancellation) {
          return;
        }

        cancellation.requested = false;
        cancellation.sentTurnId = undefined;
        setCancellationError(
          error instanceof Error
            ? error.message
            : "No se pudo cancelar la respuesta.",
        );
        setCancellationState("idle");
      });
    },
    [session],
  );

  const handleEvent = useCallback(
    (event: HandleMessageStreamEvent) => {
      if (event.type !== "turn.started") {
        return;
      }

      const cancellation = cancellationRef.current;
      cancellation.turnId = event.data.turnId;
      cancelTurn(event.data.turnId);
    },
    [cancelTurn],
  );

  const agent = useEveAgent({
    initialEvents: saved.events,
    onEvent: handleEvent,
    onFinish: (snapshot) => {
      writePersistedChat(STORAGE_KEY, {
        events: snapshot.events,
        session: snapshot.session,
      });
    },
    session,
  });
  // Mientras haya una investigación del analizador "en_progreso", pregunta en segundo
  // plano si ya hay respuesta y la inyecta sola apenas llegue (ver
  // components/use-analizador-poll.ts y "Respuesta tardía del analizador" en
  // agent/instructions.md).
  useAnalizadorPoll(agent, session);
  // Texto del indicador "trabajando" de abajo — refleja la tool activa en vez de un
  // texto fijo (ver components/use-active-tool-label.ts).
  const activeToolLabel = useActiveToolLabel(agent.data.messages);

  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  // El turno "user" que el backend (widget_back_end): /escalations/respond (o el polling del analizador, ver
  // arriba) inyecta al reanudar la conversación no lo escribió el usuario — se oculta
  // para que solo se vea la respuesta que el agente genera a partir de él (ver
  // lib/escalation.ts y lib/analizador-reply.ts).
  const visibleMessages = agent.data.messages.filter(
    (message) =>
      !isEscalationReplyMessage(message) && !isAnalizadorReplyMessage(message),
  );
  const isEmpty = visibleMessages.length === 0;
  // El indicador "trabajando" de abajo (Pensando…/Buscando en la documentación…, ver
  // más abajo) solo tapa el hueco antes de que exista algo del mensaje nuevo para
  // mostrar — apenas el último mensaje visible ya tiene texto o un tool call, ese
  // contenido (con su propio shimmer, ver ToolCallHistory/ToolPart en agent-message.tsx)
  // ya comunica "en curso" por sí solo. Sin este chequeo quedaban los dos a la vez, un
  // estado "en curso" duplicado que además podía seguir un instante después de que el
  // mensaje ya se viera completo.
  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];
  const lastMessageHasVisibleContent =
    lastVisibleMessage?.role === "assistant" &&
    lastVisibleMessage.parts.some(
      (part) => part.type === "text" || part.type === "dynamic-tool",
    );
  // eve (EveAgentStore.send) primero marca status "submitted" y recién DESPUÉS —tras un
  // `await` de prepareSend— agrega el mensaje optimista del usuario. En ese primer
  // render (isBusy ya true, tu mensaje todavía no) "Pensando…" se pintaba antes que la
  // burbuja (y en el primer mensaje, junto al saludo); al llegar la burbuja, "Pensando…"
  // bajaba de golpe. Solo se muestra una vez que hay un mensaje visible (la burbuja ya
  // está) y el último no tiene contenido todavía.
  const showWorkingIndicator =
    isBusy &&
    cancellationState === "idle" &&
    visibleMessages.length > 0 &&
    !lastMessageHasVisibleContent;
  // Nunca se muestra agent.error?.message / cancellationError tal cual — ver
  // toFriendlyErrorMessage arriba. El crudo solo va a consola, para debug.
  useEffect(() => {
    if (agent.error) {
      console.error("[jelou-widget] eve agent error:", agent.error);
    }
  }, [agent.error]);
  const errorMessage = cancellationError
    ? "No pudimos detener la respuesta. Es posible que ya haya terminado."
    : agent.error
      ? toFriendlyErrorMessage(agent.error)
      : undefined;
  // "Reintentar" solo tiene sentido cuando lo que falló fue el turno en sí (no un intento
  // de cancelar) y tenemos guardado qué mandar de nuevo.
  const canRetry = !cancellationError && agent.error !== undefined && lastSendRef.current !== null;
  const handleRetry = () => {
    const last = lastSendRef.current;
    if (!last || isBusy) return;
    prepareTurn();
    void agent.send(last);
  };
  // Ver comentario igual en agent-chat.tsx: ids ya presentes al montar (historial), para
  // decidir si un mensaje debe animarse sin depender del timing exacto de isStreaming.
  const initialMessageIdsRef = useRef<Set<string> | null>(null);
  if (initialMessageIdsRef.current === null) {
    initialMessageIdsRef.current = new Set(
      agent.data.messages.map((message) => message.id),
    );
  }

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    reportIdle(agent.status === "ready");
  }, [agent.status, reportIdle]);

  // Aviso "el agente respondió" con el panel minimizado (ver AgentReplyToast más abajo):
  // si el usuario cerró el widget pero sigue en la pestaña y llega una respuesta nueva
  // —ya sea de un turno normal o de una que se inyecta sola más tarde (escalamiento
  // resuelto, ver use-eve-chat-sync.ts, o el fallback del analizador, ver
  // use-analizador-poll.ts: ambas terminan pasando por un turno normal de `agent`, por
  // eso alcanza con mirar la transición de isBusy acá)— se avisa con una burbuja junto al
  // botón flotante en vez de perderse en silencio. Fuera de alcance a propósito: avisar
  // con la pestaña en segundo plano o el navegador cerrado (Notification API / push real)
  // — ver la conversación donde se acotó esto.
  const wasBusyRef = useRef(false);
  const [toast, setToast] = useState<{ id: string; preview: string } | null>(null);

  useEffect(() => {
    const justFinished = wasBusyRef.current && !isBusy;
    wasBusyRef.current = isBusy;
    if (!justFinished || open) return;

    const lastMessage = visibleMessages[visibleMessages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;

    const text = lastMessage.parts
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    const preview =
      text.length > 90
        ? `${text.slice(0, 90).trimEnd()}…`
        : text || "Tenés una respuesta nueva.";

    setToast({ id: lastMessage.id, preview });
  }, [isBusy, open, visibleMessages]);

  // El usuario abrió el chat (desde la burbuja o desde el botón flotante) — ya la vio.
  useEffect(() => {
    if (open) setToast(null);
  }, [open]);

  // Se cierra sola si nadie la toca, para no quedar pegada en la página del cliente.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8_000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    onPeekChange(toast !== null);
  }, [toast, onPeekChange]);

  const prepareTurn = () => {
    cancellationRef.current = { requested: false };
    setCancellationError(undefined);
    setCancellationState("idle");
  };

  const requestCancellation = () => {
    if (!isBusy || cancellationState !== "idle") {
      return;
    }

    const cancellation = cancellationRef.current;
    cancellation.requested = true;
    setCancellationError(undefined);
    setCancellationState("requested");

    if (cancellation.turnId !== undefined) {
      cancelTurn(cancellation.turnId);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if ((!text && attachments.length === 0) || isBusy) return;

    prepareTurn();
    setInput("");
    const files = attachments;
    clearAttachments();
    // Se consume una sola vez: si el usuario "retomó" una conversación pasada, este
    // primer envío (con o sin adjuntos) le antepone el contexto oculto; el resto de la
    // conversación sigue como un chat normal (ver handleSelectConversation arriba).
    const resumeContext = pendingResumeContextRef.current;
    pendingResumeContextRef.current = undefined;

    if (files.length === 0 && !resumeContext) {
      lastSendRef.current = { message: text };
      await agent.send({ message: text });
      return;
    }

    const parts: UserContent = [];
    if (resumeContext) {
      parts.push({ text: resumeContext, type: "text" });
    }
    if (text.length > 0) {
      parts.push({ text, type: "text" });
    }
    for (const file of files) {
      parts.push({
        data: file.url,
        filename: file.filename,
        mediaType: file.mediaType,
        type: "file",
      });
      // Además de la imagen en sí (para que el modelo la "vea"), le mandamos su URL
      // pública como texto plano citable — el modelo no puede transcribir el contenido
      // de una imagen que ve, pero sí puede repetir esta URL si decide escalar el caso
      // (ver widget_back_end/agent/tools/escalar.ts, campo `imagenes`, y use-chat-attachments.ts).
      if (file.mediaUrl) {
        parts.push({ text: `[Imagen adjunta: ${file.mediaUrl}]`, type: "text" });
      }
    }
    lastSendRef.current = { message: parts };
    await agent.send({ message: parts });
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  // Pegar una imagen (Ctrl+V/Cmd+V con algo copiado, p.ej. un screenshot) la adjunta
  // igual que si se hubiera elegido desde el explorador de archivos — mismo pipeline
  // (Data URL + subida al backend (widget_back_end): /attachments/upload-image, ver use-chat-attachments.ts). Si
  // el portapapeles no trae ningún archivo de imagen (paste de texto normal), no se
  // intercepta nada — el pegado de texto sigue funcionando como siempre.
  const handleInputPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (imageFiles.length === 0) return;
    event.preventDefault();
    void addFiles(imageFiles);
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      void addFiles(event.target.files);
    }
    event.target.value = "";
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6"
      style={JELOU_VARS}
    >
      {/* Recolorea solo la burbuja de mensajes de usuario (variant="default" de
          <Bubble>, componente compartido con la página completa) con el navy
          de burbuja real de Jelou (--jou-bubble-background), distinto del
          acento teal usado en botones/íconos, sin tocar el componente
          compartido ni el tema global. */}
      <style>{`
        .jelou-notepad-widget [data-slot="bubble"][data-variant="default"] [data-slot="bubble-content"] {
          background-color: var(--widget-bubble);
          color: var(--widget-bubble-foreground);
        }
      `}</style>

      <div
        aria-label="Jelou"
        className={cn(
          // Tamaño fijo (420x680, preset "Large") en vez de responsivo — el widget
          // siempre abre con esta misma medida exacta. El min() con el viewport es
          // solo un tope de seguridad para que no se corte en pantallas realmente
          // chicas (celulares), no cambia el tamaño objetivo. "group" habilita el botón
          // de cerrar de abajo, que solo se ve con hover sobre el panel.
          //
          // El resto de -Npx de cada calc() NO es el mismo "2rem" de siempre: este panel
          // comparte el contenedor flex-col con el botón flotante de abajo (ver el div
          // "fixed inset-x-4 bottom-4 ... flex flex-col items-end gap-3" que envuelve
          // todo esto), así que el alto que le sobra a la ventana tiene que alcanzar
          // también para ese botón (size-12 = 48px) + el gap-3 (12px) + el offset inferior
          // del contenedor (bottom-4 = 16px en mobile, sm:bottom-6 = 24px desde sm) + un
          // margen simétrico arriba (16px/24px). Con un simple "-2rem" (32px) ese resto no
          // le alcanzaba a nada más que al propio panel, así que en pantallas no muy altas
          // el conjunto completo (panel + botón) terminaba más alto que la ventana y se
          // recortaba contra el borde de arriba, sin margen ni esquina redondeada visibles
          // ahí — exactamente el bug reportado. 92px = 48+12+16+16 (mobile). 108px =
          // 48+12+24+24 (desde sm, cuando el offset del contenedor pasa a bottom-6).
          "jelou-notepad-widget relative pointer-events-auto flex h-[min(680px,calc(100vh-92px))] w-[min(420px,calc(100vw-2rem))] origin-bottom-right flex-col overflow-hidden rounded-[20px] shadow-xl transition-all duration-200 sm:h-[min(680px,calc(100vh-108px))]",
          open
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0",
        )}
        style={{
          backgroundColor: "var(--widget-paper)",
          border: "1px solid var(--widget-border)",
        }}
        aria-hidden={!open}
        role="dialog"
      >
        {/* Header (estructura tomada del de Intercom: avatar + nombre + subtítulo a la
            izquierda, cerrar a la derecha) — antes el panel arrancaba directo en el
            canvas de mensajes y el botón de cerrar era uno suelto, flotante, que solo
            aparecía con hover sobre el panel. title/subtitle son props que ChatWidget ya
            recibía pero nunca se mostraban en ningún lado. */}
        <div
          className="flex shrink-0 items-center gap-2.5 px-3.5 py-3"
          style={{ borderBottom: "1px solid var(--widget-border-soft)" }}
        >
          {/* "Botón de redirección" a la vista "Mensajes" (lista de conversaciones de
              los últimos 7 días, tipo Intercom) — mismo ícono actúa como "volver al
              chat" una vez adentro de la lista. Solo aparece con `email`: sin eso el
              backend no tiene cómo identificar de quién son las conversaciones (ver
              GET /conversations en widget_back_end). */}
          {email ? (
            <button
              aria-label={
                view === "list" ? "Volver al chat" : "Ver conversaciones anteriores"
              }
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--widget-text-muted)] transition-colors hover:bg-[var(--widget-border-soft)] hover:text-[var(--widget-text)]"
              onClick={() =>
                view === "list" ? setView("chat") : openConversationList()
              }
              type="button"
            >
              {view === "list" ? (
                <ArrowLeftIcon className="size-4" />
              ) : (
                <HistoryIcon className="size-4" />
              )}
            </button>
          ) : null}
          {/* Avatar "default" (32px) en vez de "sm" (24px) para agrandar el isotipo
              del header — se veía chico al lado del título. */}
          <Avatar size="default">
            <AvatarFallback className="bg-transparent">
              <JelouIsotype size={26} />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            {/* El título del header ahora es siempre "Jelou" (fijo, no usa la prop
                `title`) y el subtítulo se eliminó del todo — antes variaban según
                `title`/`subtitle` (ver ChatWidgetProps más arriba, que llegaban desde el
                theme/embedding config: app/widget/page.tsx, public/widget-loader.js,
                etc.). Las props se dejan intactas para no romper esos call sites, solo
                dejaron de usarse acá. */}
            <p
              className="truncate text-sm font-semibold"
              style={{ color: "var(--widget-text)" }}
            >
              Jelou
            </p>
          </div>
          <button
            aria-label="Cerrar chat"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--widget-text-muted)] transition-colors hover:bg-[var(--widget-border-soft)] hover:text-[var(--widget-text)]"
            onClick={() => setOpen(false)}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {view === "list" ? (
          <ConversationList
            conversations={conversations}
            onRetry={loadConversations}
            onSelect={handleSelectConversation}
            resumingSessionId={resumingSessionId}
            status={conversationsStatus}
          />
        ) : null}

        {/* Footer fijo de la vista "Mensajes": antes no había ninguna forma de arrancar
            una conversación nueva desde acá — solo se podía volver al chat en curso (el
            botón del header) o reabrir una de las anteriores. Shrink-0, siempre visible
            (incluso con la lista vacía o en error), para que "preguntar algo nuevo" sea
            una salida siempre disponible desde esta vista. */}
        {view === "list" ? (
          <div
            className="shrink-0 p-3"
            style={{ borderTop: "1px solid var(--widget-border-soft)" }}
          >
            {/* Botón del kit @jelou-ui-2 (variant "outline": fondo blanco, borde y texto
                en el primary #00B3C7) con el isotipo de Jelou a la derecha, como el
                "Hacer una pregunta" de Intercom. Si se quiere el borde gris suave de
                antes, cambiar a variant="white". */}
            <div className="flex justify-center">
              <JouButton onClick={handleStartNewConversation} variant="outline">
                Hacer una pregunta
                <JelouIsotype size={20} />
              </JouButton>
            </div>
          </div>
        ) : null}

        {view === "chat" && errorMessage ? (
          <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-3 py-2">
            <div className="flex items-start gap-2 text-xs">
              <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground">{errorMessage}</p>
                {canRetry ? (
                  <button
                    className="mt-0.5 font-medium text-destructive underline-offset-2 hover:underline"
                    onClick={handleRetry}
                    type="button"
                  >
                    Reintentar
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {view === "chat" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Ver comentario igual en agent-chat.tsx: Conversation (use-stick-to-bottom)
              en vez de @shadcn/react/message-scroller — sigue el contenido con física de
              resortes, no scroll-behavior CSS reactivo, y no se traba con el ritmo
              parejo de useLineByLineReveal. Sin anclaje de "pregunta nueva arriba": solo
              sigue el final, que es lo que queríamos. */}
          <Conversation className="h-full min-h-0 flex-1" initial={initialScroll}>
            <ConversationContent className="gap-2 p-4">
              {/* Historial de solo lectura de la conversación "retomada" (ver
                  handleSelectConversation) — se muestra acá, separado del array de
                  mensajes de eve, porque la sesión nueva no incluye estos mensajes
                  (una sesión "completed" no se puede reabrir, ver el comentario en
                  resumedTranscript más arriba). El contexto real que el agente SÍ lee
                  va oculto en el próximo mensaje del usuario (ver handleSubmit).
                  Mismo AgentMessage que la conversación en vivo (ver
                  historicalMessages/buildHistoricalMessages más arriba) — antes era un
                  Bubble/Marker a mano, sin tool calls ni markdown, que se veía distinto
                  a como se vio en vivo. canRespond=false e isStreaming=false siempre:
                  es historial, no hay nada pendiente de responder ni en curso. */}
              {resumedTranscript && resumedTranscript.length > 0 ? (
                <div
                  className="mb-1 flex flex-col gap-2 pb-3"
                  style={{ borderBottom: "1px dashed var(--widget-border)" }}
                >
                  <p
                    className="text-center text-[11px] font-medium"
                    style={{ color: "var(--widget-text-faint)" }}
                  >
                    Conversación anterior
                  </p>
                  {historicalMessages.map((historyMessage) => (
                    <AgentMessage
                      canRespond={false}
                      eveSessionId={resumedSessionId ?? ""}
                      isLatestMessage={false}
                      isNew={false}
                      isStreaming={false}
                      key={historyMessage.id}
                      message={historyMessage}
                      onInputResponses={() => {}}
                    />
                  ))}
                </div>
              ) : null}

              {isEmpty && !resumedTranscript ? (
                // Sin avatar: AgentMessage (el que renderiza las respuestas reales, ver
                // agent-message.tsx) tampoco lo usa, así que el texto queda alineado
                // igual desde el primer mensaje — antes el saludo arrancaba corrido ~40px
                // a la derecha (por el Avatar) y el primer mensaje real aparecía pegado
                // al borde, lo que se sentía como un salto.
                <Message align="start">
                  <MessageContent>
                    <Marker>
                      <MarkerContent>
                        {name
                          ? `Hola ${name}, ¿en qué puedo ayudarte hoy?`
                          : "Hola, ¿en qué puedo ayudarte hoy?"}
                      </MarkerContent>
                    </Marker>
                  </MessageContent>
                </Message>
              ) : null}

              {visibleMessages.map((message, index) => (
                <AgentMessage
                  key={message.id}
                  canRespond={!isBusy}
                  eveSessionId={session.state.sessionId ?? ""}
                  isLatestMessage={index === visibleMessages.length - 1}
                  isNew={!initialMessageIdsRef.current?.has(message.id)}
                  // Comparado contra agent.data.messages (sin filtrar) en vez de
                  // contra visibleMessages/index: si se compara por índice, mientras el
                  // analizador resuelve en segundo plano (ver use-analizador-poll.ts),
                  // el mensaje "reply" oculto que agent.send() agrega queda afuera de
                  // visibleMessages, así que el ÚLTIMO mensaje VISIBLE sigue siendo el
                  // mensaje anterior (el que ya había terminado, con su botón de copiar
                  // ya mostrado) hasta que la respuesta nueva arranca a streamear — eso
                  // lo marcaba como isStreaming de nuevo y le hacía desaparecer el botón
                  // de copiar sin que el usuario hiciera nada. Comparando por id contra
                  // el mensaje crudo más reciente, ese mensaje ya resuelto nunca vuelve a
                  // marcarse como streaming solo porque hay un turno oculto en curso.
                  isStreaming={
                    agent.status === "streaming" &&
                    message.id ===
                      agent.data.messages[agent.data.messages.length - 1]?.id
                  }
                  message={message}
                  onInputResponses={(inputResponses) => {
                    prepareTurn();
                    return agent.send({ inputResponses });
                  }}
                />
              ))}

              {/* Hueco fijo para el indicador "trabajando": reserva su alto (min-h-5 = el
                  de una fila de Marker) también en reposo, así que cuando aparece/desaparece
                  "Pensando…" no cambia la altura del contenido y Conversation
                  (use-stick-to-bottom) no vuelve a deslizar el scroll ~28px por eso. */}
              <div className="min-h-5">
              {showWorkingIndicator ? (
                // Sin avatar, igual que el saludo de arriba: este bloque es el que se
                // reemplaza en el momento exacto en que llega contenido real (ver
                // lastMessageHasVisibleContent), y AgentMessage nunca pinta un avatar —
                // mantenerlo acá hacía que el texto de la respuesta "saltara" ~40px a la
                // izquierda apenas dejaba de ser el placeholder.
                <Message align="start">
                  <MessageContent>
                    <Marker role="status">
                      <MarkerContent>
                        {/* AnimatePresence con key={activeToolLabel} en mode="wait": al
                            cambiar de tool (p.ej. "Pensando…" → "Buscando en la
                            documentación" → "Investigando tu caso…") el texto viejo
                            termina de desvanecerse antes de que entre el nuevo — con el
                            modo por default ("sync") los dos coexisten en el DOM durante
                            el crossfade, lo que ensancha la línea un instante y corre
                            cualquier cosa que venga después. */}
                        <AnimatePresence initial={false} mode="wait">
                          <motion.span
                            key={activeToolLabel}
                            animate={{ opacity: 1, y: 0 }}
                            className="shimmer inline-block"
                            exit={{ opacity: 0, y: -4 }}
                            initial={{ opacity: 0, y: 4 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                          >
                            {activeToolLabel}
                          </motion.span>
                        </AnimatePresence>
                      </MarkerContent>
                    </Marker>
                  </MessageContent>
                </Message>
              ) : null}
              </div>
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>
        ) : null}

        {view === "chat" ? (
        <form
          onSubmit={handleSubmit}
          className="flex shrink-0 flex-col gap-1.5 p-4"
          style={{ borderTop: "1px solid var(--widget-border-soft)" }}
        >
          <ChatAttachmentList
            attachments={attachments}
            onRemove={removeAttachment}
            disabled={isBusy}
          />
          {attachmentError ? (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <span className="min-w-0 flex-1">{attachmentError}</span>
              <button
                aria-label="Cerrar aviso"
                className="shrink-0 rounded-full p-0.5 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={clearAttachmentError}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </p>
          ) : null}

          <div
            className="flex items-center gap-2 rounded-[10px] bg-white p-1.5"
            style={{ border: "1px solid var(--widget-border)" }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
            <ChiclitButton
              ariaLabel="Adjuntar archivo"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              <PaperclipIcon
                className="size-4"
                style={{ color: "var(--widget-accent)" }}
              />
            </ChiclitButton>

            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              onPaste={handleInputPaste}
              placeholder="Escribe tu pregunta…"
              rows={1}
              maxLength={1000}
              className="field-sizing-content max-h-32 min-h-9 min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 font-mono text-[13px] outline-none transition-[height] duration-150 ease-out placeholder:text-[var(--widget-text-muted)]"
              // El color del texto YA escrito se cambió de --widget-text-muted a
              // --widget-text (normal, no gris) en un cambio anterior, pero el campo
              // vacío solo muestra el placeholder — y ese seguía en --widget-text-faint
              // (el gris MÁS claro de los tres, pensado para texto de placeholder "de
              // catálogo"), que es justamente lo que se ve en el campo antes de escribir
              // y lo que se seguía leyendo como "deshabilitado". Subido un escalón a
              // --widget-text-muted (más oscuro, mismo tono que el ícono de historial de
              // arriba) para que no se vea tan apagado incluso vacío.
              style={{ color: "var(--widget-text)" }}
              disabled={isBusy && cancellationState === "idle"}
            />

            <ChiclitButton
              ariaLabel={isRecording ? "Detener grabación" : "Grabar audio"}
              ariaPressed={isRecording}
              active={isRecording}
              disabled={isBusy}
              onClick={toggleRecording}
            >
              <MicIcon
                className={cn("size-4", isRecording && "animate-pulse")}
                style={{ color: isRecording ? "#FFFFFF" : "var(--widget-accent)" }}
              />
            </ChiclitButton>

            {isBusy ? (
              <ChiclitButton ariaLabel="Detener" onClick={requestCancellation}>
                <SquareIcon
                  className="size-3.5 fill-current"
                  style={{ color: "var(--widget-accent)" }}
                />
              </ChiclitButton>
            ) : (
              <ChiclitButton
                type="submit"
                ariaLabel="Enviar"
                disabled={!input.trim() && attachments.length === 0}
              >
                <SendIcon className="size-4" style={{ color: "var(--widget-accent)" }} />
              </ChiclitButton>
            )}
          </div>
        </form>
        ) : null}
      </div>

      <AnimatePresence>
        {toast && !open ? (
          <AgentReplyToast
            key={toast.id}
            onDismiss={() => setToast(null)}
            onOpen={() => setOpen(true)}
            preview={toast.preview}
            sender="Jelou"
          />
        ) : null}
      </AnimatePresence>

      <Button
        type="button"
        size="icon-lg"
        style={JELOU_VARS}
        className="pointer-events-auto size-12 rounded-full bg-[var(--widget-accent)] text-[var(--widget-accent-foreground)] shadow-lg hover:bg-[var(--widget-accent)]/90"
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <XIcon /> : <MessageCircleIcon />}
      </Button>
    </div>
  );
}

/**
 * Aviso "el agente respondió" que aparece junto al botón flotante cuando el panel está
 * minimizado (ver el efecto que arma `toast` en ChatWidgetInner). Estructura calcada de
 * la notificación de Intercom que pasó Esteban como referencia — avatar cuadrado a la
 * izquierda, mensaje + "remitente • Ahora" a la derecha, botón de cerrar en la esquina —
 * en vez de la burbuja con colita de las versiones anteriores. Superficie neutral
 * (blanca + borde suave, igual que el panel del chat), sin acento a pantalla completa.
 * Clickear el cuerpo abre el chat; si no la tocan, se cierra sola a los 8s (ver el
 * setTimeout en ChatWidgetInner).
 */
function AgentReplyToast({
  preview,
  sender,
  onOpen,
  onDismiss,
}: {
  readonly preview: string;
  readonly sender: string;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      aria-label={`Notificación de mensaje de ${sender}: ${preview}`}
      aria-roledescription="message notification"
      // Alto fijo (no `auto`) a propósito: esta tarjeta vive en un flujo flex-col junto al
      // botón flotante (ver el contenedor más arriba), así que si su alto dependiera del
      // contenido, un preview de 1 línea vs. uno de 2 líneas corría/empujaba el resto —
      // se sentía como que la notificación "cambiaba de tamaño" cada vez que aparecía.
      // Con un alto fijo + overflow-hidden, siempre ocupa exactamente el mismo espacio,
      // sin importar cuánto texto tenga el preview (line-clamp-2 se sigue encargando de
      // cortarlo si no entra).
      className="pointer-events-auto relative h-[84px] w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl p-3 pr-7 shadow-lg"
      exit={{ opacity: 0, scale: 0.95, y: 6 }}
      initial={{ opacity: 0, scale: 0.95, y: 6 }}
      role="article"
      style={{
        ...JELOU_VARS,
        backgroundColor: "var(--widget-paper)",
        border: "1px solid var(--widget-border)",
      }}
      tabIndex={0}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <button
        aria-label={`Abrir conversación con ${sender}`}
        className="flex h-full w-full items-start gap-2.5 text-left"
        onClick={onOpen}
        type="button"
      >
        {/* size-12 (48px) en vez de size-10 (40px): mismo agrandado del isotipo que
            en el resto del widget. */}
        <span className="flex size-12 shrink-0 items-center justify-center">
          <JelouIsotype size={38} />
        </span>
        <span className="min-w-0 flex-1">
          {/* h-8 (2 líneas de text-xs) reserva el mismo espacio tenga el preview 1 o 2
              líneas — si solo fuera line-clamp-2, un preview corto dejaba la tarjeta más
              baja y la línea de abajo ("Jelou • Ahora") se movía hacia arriba. */}
          <span
            className="line-clamp-2 block h-8 text-xs"
            style={{ color: "var(--widget-text)" }}
          >
            {preview}
          </span>
          <span className="mt-1 block text-[11px]" style={{ color: "var(--widget-text-faint)" }}>
            {sender} • Ahora
          </span>
        </span>
      </button>
      <button
        aria-label="Descartar aviso"
        className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full text-[var(--widget-text-muted)] transition-colors hover:bg-[var(--widget-border-soft)]"
        onClick={onDismiss}
        type="button"
      >
        <XIcon className="size-3" />
      </button>
    </motion.div>
  );
}

/** Botón "chiclet" cuadrado: blanco, borde suave, ícono teal (acento Jelou). */
function ChiclitButton({
  children,
  ariaLabel,
  ariaPressed,
  active,
  disabled,
  onClick,
  type = "button",
}: {
  readonly children: ReactNode;
  readonly ariaLabel: string;
  readonly ariaPressed?: boolean;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-colors disabled:pointer-events-none disabled:opacity-40"
      style={{
        backgroundColor: active ? "var(--widget-accent)" : "#FFFFFF",
        border: `1px solid ${active ? "var(--widget-accent)" : "var(--widget-border)"}`,
      }}
    >
      {children}
    </button>
  );
}

