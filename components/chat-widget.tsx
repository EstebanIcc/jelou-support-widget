"use client";

import type { HandleMessageStreamEvent } from "eve/client";
import { Client } from "eve/client";
import { useEveAgent } from "eve/react";
import type { UserContent } from "ai";
import {
  AlertCircleIcon,
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
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { AgentMessage } from "@/app/_components/agent-message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChatAttachmentList } from "@/components/chat-attachment-list";
import { useChatAttachments } from "@/components/use-chat-attachments";
import {
  readPersistedChat,
  useEveChatWatcher,
  writePersistedChat,
} from "@/components/use-eve-chat-sync";
import { isEscalationReplyMessage } from "@/lib/escalation";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import { cn } from "@/lib/utils";

type CancellationState = "idle" | "requested" | "cancelling";

type Cancellation = {
  requested: boolean;
  sentTurnId?: string;
  turnId?: string;
};

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
   * que lo resuelven server-side con el mismo email vía agent/lib/jelou-gateway.ts). Solo
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
   * al pedir el api-key dinámico del CLI (ver agent/lib/support-widget-service.ts). Sin
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
  const { generation, reportIdle } = useEveChatWatcher(STORAGE_KEY);

  // Cuando corre embebido en un <iframe> (ver app/widget/page.tsx +
  // public/widget-loader.js), avisa a la página que lo contiene si el panel está
  // abierto o cerrado, para que el loader pueda redimensionar el iframe: chico
  // (solo el botón) cuando está cerrado, grande (botón + panel) cuando está abierto.
  useEffect(() => {
    if (typeof window === "undefined" || window.self === window.top) return;
    window.parent.postMessage({ source: "jelou-widget", type: "resize", open }, "*");
  }, [open]);

  return (
    <ChatWidgetInner
      key={generation}
      email={email}
      name={name}
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
  name,
  open,
  reportIdle,
  sessionId,
  setOpen,
  subtitle,
  title,
}: ChatWidgetProps & {
  readonly open: boolean;
  readonly reportIdle: (idle: boolean) => void;
  readonly setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const [saved] = useState(() => readPersistedChat(STORAGE_KEY));
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    error: attachmentError,
    isRecording,
    toggleRecording,
  } = useChatAttachments();

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
      host: "",
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
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  // El turno "user" que /api/escalations/respond inyecta al reanudar un escalamiento
  // no lo escribió el usuario — se oculta para que solo se vea la respuesta que el
  // agente genera a partir de él (ver lib/escalation.ts).
  const visibleMessages = agent.data.messages.filter(
    (message) => !isEscalationReplyMessage(message),
  );
  const isEmpty = visibleMessages.length === 0;
  const errorMessage = cancellationError ?? agent.error?.message;
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

    if (files.length === 0) {
      await agent.send({ message: text });
      return;
    }

    const parts: UserContent = [];
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
    }
    await agent.send({ message: parts });
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
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
        aria-label={title}
        className={cn(
          // Tamaño fijo (420x680, preset "Large") en vez de responsivo — el widget
          // siempre abre con esta misma medida exacta. El min() con el viewport es
          // solo un tope de seguridad para que no se corte en pantallas realmente
          // chicas (celulares), no cambia el tamaño objetivo.
          "jelou-notepad-widget pointer-events-auto flex h-[min(680px,calc(100vh-2rem))] w-[min(420px,calc(100vw-2rem))] origin-bottom-right flex-col overflow-hidden rounded-[20px] shadow-xl transition-all duration-200",
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
        {/* Sin header ni anillas de cuaderno: el panel arranca directo en el
            canvas de mensajes para maximizar el espacio vertical. Cerrar sigue
            disponible desde el botón flotante (siempre visible, fuera de este
            panel) que alterna abierto/cerrado. */}
        {errorMessage ? (
          <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-3 py-2">
            <div className="flex items-start gap-2 text-xs">
              <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <p className="text-muted-foreground">{errorMessage}</p>
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Ver comentario igual en agent-chat.tsx: Conversation (use-stick-to-bottom)
              en vez de @shadcn/react/message-scroller — sigue el contenido con física de
              resortes, no scroll-behavior CSS reactivo, y no se traba con el ritmo
              parejo de useLineByLineReveal. Sin anclaje de "pregunta nueva arriba": solo
              sigue el final, que es lo que queríamos. */}
          <Conversation className="h-full min-h-0 flex-1">
            <ConversationContent className="gap-4 p-4">
              {isEmpty ? (
                <Message align="start">
                  <MessageAvatar>
                    <Avatar size="sm">
                      <AvatarFallback
                        className="font-semibold"
                        style={{
                          backgroundColor: "var(--widget-accent)",
                          color: "var(--widget-accent-foreground)",
                        }}
                      >
                        J
                      </AvatarFallback>
                    </Avatar>
                  </MessageAvatar>
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
                  isNew={!initialMessageIdsRef.current?.has(message.id)}
                  isStreaming={
                    agent.status === "streaming" &&
                    index === visibleMessages.length - 1
                  }
                  message={message}
                  onInputResponses={(inputResponses) => {
                    prepareTurn();
                    return agent.send({ inputResponses });
                  }}
                />
              ))}

              {isBusy && cancellationState === "idle" ? (
                <Message align="start">
                  <MessageAvatar>
                    <Avatar size="sm">
                      <AvatarFallback
                        className="font-semibold"
                        style={{
                          backgroundColor: "var(--widget-accent)",
                          color: "var(--widget-accent-foreground)",
                        }}
                      >
                        J
                      </AvatarFallback>
                    </Avatar>
                  </MessageAvatar>
                  <MessageContent>
                    <Marker role="status">
                      <MarkerContent className="shimmer">
                        Consultando docs Jelou…
                      </MarkerContent>
                    </Marker>
                  </MessageContent>
                </Message>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>

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
            <p className="text-xs text-destructive">{attachmentError}</p>
          ) : null}

          <div
            className="flex items-center gap-2 rounded-[10px] bg-white p-1.5"
            style={{ border: "1px solid var(--widget-border)" }}
          >
            <input
              ref={fileInputRef}
              type="file"
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
              placeholder="Escribe tu pregunta…"
              rows={1}
              maxLength={1000}
              className="field-sizing-content max-h-32 min-h-9 min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 font-mono text-[13px] outline-none placeholder:text-[var(--widget-text-faint)]"
              style={{ color: "var(--widget-text-muted)" }}
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
      </div>

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

