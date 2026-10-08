"use client";

import type { UserContent } from "ai";
import { Client, type HandleMessageStreamEvent } from "eve/client";
import { useEveAgent } from "eve/react";
import {
  AlertCircleIcon,
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
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { AgentMessage } from "@/app/_components/agent-message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/jelou/button";
import { ChatAttachmentList } from "@/components/chat-attachment-list";
import {
  ATTACHMENT_ACCEPT,
  useChatAttachments,
} from "@/components/use-chat-attachments";
import {
  readPersistedChat,
  useEveChatWatcher,
  writePersistedChat,
} from "@/components/use-eve-chat-sync";
import { isAnalizadorReplyMessage } from "@/lib/analizador-reply";
import { isEscalationReplyMessage } from "@/lib/escalation";
import { useAnalizadorPoll } from "@/components/use-analizador-poll";
import { useActiveToolLabel } from "@/components/use-active-tool-label";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Message, MessageContent } from "@/components/ui/message";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";

const AGENT_NAME = "Asistente Jelou";
const STORAGE_KEY = "jelou-eve-agent:full-chat";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];
type CancellationState = "idle" | "requested" | "cancelling";

type Cancellation = {
  requested: boolean;
  sentTurnId?: string;
  turnId?: string;
};

/**
 * Wrapper que solo posee el watcher de reconexión (ver use-eve-chat-sync.ts).
 * Cuando el watcher detecta actividad server-side externa a esta pestaña —el
 * caso que nos interesa: la respuesta de un equipo a un escalamiento— fuerza
 * un remount de AgentChatInner vía `key`, que vuelve a leer localStorage ya
 * actualizado y reconstruye la conversación con lo nuevo.
 */
export function AgentChat() {
  const { generation, reportIdle } = useEveChatWatcher(STORAGE_KEY);
  return (
    <AgentChatInner
      key={generation}
      // Mismo fix que components/chat-widget.tsx: solo el primer montaje real anima el
      // scroll inicial. Un remount con generation > 0 (respuesta externa detectada por el
      // watcher) usa "instant" para no mostrar la conversación saltando arriba y volviendo
      // a bajar sola.
      initialScroll={generation === 0 ? "smooth" : "instant"}
      reportIdle={reportIdle}
    />
  );
}

function AgentChatInner({
  initialScroll,
  reportIdle,
}: {
  readonly initialScroll: "instant" | "smooth";
  readonly reportIdle: (idle: boolean) => void;
}) {
  const [saved] = useState(() => readPersistedChat(STORAGE_KEY));
  const [session] = useState(() =>
    new Client({
      host: process.env.NEXT_PUBLIC_EVE_BACKEND_URL ?? "",
      preserveCompletedSessions: true,
    }).session(
      saved.session,
    ),
  );
  const cancellationRef = useRef<Cancellation>({ requested: false });
  const [cancellationError, setCancellationError] = useState<string>();
  const [cancellationState, setCancellationState] =
    useState<CancellationState>("idle");
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        setCancellationError(toErrorMessage(error));
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
  // Mismo criterio que chat-widget.tsx (ver showWorkingIndicator ahí): eve marca "ocupado"
  // un render ANTES de agregar el mensaje optimista del usuario, así que sin este chequeo
  // "Pensando…" aparecía primero y la burbuja nueva lo empujaba hacia abajo al entrar.
  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];
  const lastMessageHasVisibleContent =
    lastVisibleMessage?.role === "assistant" &&
    lastVisibleMessage.parts.some(
      (part) => part.type === "text" || part.type === "dynamic-tool",
    );
  const showWorkingIndicator =
    isBusy &&
    cancellationState === "idle" &&
    visibleMessages.length > 0 &&
    !lastMessageHasVisibleContent;
  // Ids de mensajes que ya existían al montar (vienen de localStorage/historial) — se
  // captura una sola vez, en el primer render. Sirve para decidir en AgentMessage si un
  // mensaje debe animarse letra por letra o mostrarse entero de una: usar `isStreaming`
  // para eso es poco confiable, porque si una respuesta llega muy rápido puede que React
  // nunca pinte un frame donde isStreaming sea true antes de que el texto ya esté
  // completo — el mensaje "nace" ya terminado y el reveal nunca arranca. Si el mensaje
  // no estaba en el snapshot inicial, es nuevo de esta sesión y sí debe animarse, pase lo
  // que pase con isStreaming en el instante exacto del mount.
  const initialMessageIdsRef = useRef<Set<string> | null>(null);
  if (initialMessageIdsRef.current === null) {
    initialMessageIdsRef.current = new Set(
      agent.data.messages.map((message) => message.id),
    );
  }
  const errorMessage = cancellationError ?? agent.error?.message;

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
    if ((text.length === 0 && attachments.length === 0) || isBusy) return;

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
      // Además de la imagen en sí (para que el modelo la "vea"), le mandamos su URL
      // pública como texto plano citable — el modelo no puede transcribir el contenido
      // de una imagen que ve, pero sí puede repetir esta URL si decide escalar el caso
      // (ver widget_back_end/agent/tools/escalar.ts, campo `imagenes`, y use-chat-attachments.ts).
      if (file.mediaUrl) {
        parts.push({ text: `[Imagen adjunta: ${file.mediaUrl}]`, type: "text" });
      }
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
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar size="sm">
            <AvatarFallback>AI</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{AGENT_NAME}</p>
            <p className="truncate text-xs text-muted-foreground">
              Docs Jelou · MCP · Eve
            </p>
          </div>
          <StatusDot status={agent.status} />
        </div>
      </header>

      {errorMessage ? (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-3 sm:px-6">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Error en la solicitud</p>
              <p className="mt-0.5 text-muted-foreground">{errorMessage}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
        <div className="flex min-h-0 flex-1 flex-col py-4">
          {/* Conversation envuelve use-stick-to-bottom: sigue el contenido a medida que
              crece con un algoritmo de resortes (velocity-based), no con scroll-behavior
              CSS reactivo a resize — por eso no se pelea consigo mismo ni se traba con
              el ritmo parejo que le da useLineByLineReveal al texto en agent-message.tsx.
              Reemplaza a @shadcn/react/message-scroller (tenía un bug conocido y sin fix,
              shadcn-ui/ui#11224, donde autoScroll se desenganchaba solo). Sin anclaje de
              "pregunta nueva arriba" — use-stick-to-bottom solo sigue el final, que es
              justamente lo que queríamos. */}
          <Conversation className="h-full min-h-0 flex-1" initial={initialScroll}>
            <ConversationContent className="gap-4 px-1 py-2">
              {isEmpty ? (
                <Message align="start">
                  <MessageContent>
                    <Marker>
                      <MarkerContent>
                        Pregúntame sobre Jelou AI. Consulto la documentación
                        vía MCP.
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
                <Message align="start">
                  <MessageContent>
                    <Marker role="status">
                      <MarkerContent>
                        {/* mode="wait": evita que el label viejo y el nuevo coexistan en
                            el DOM durante el crossfade (ver el mismo comentario en
                            chat-widget.tsx), lo que ensancharía la línea un instante. */}
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

        <form
          onSubmit={handleSubmit}
          className="flex shrink-0 flex-col gap-2 border-t border-border py-4"
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
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              iconOnly
              leftIcon={<PaperclipIcon />}
              aria-label="Adjuntar archivo"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
            />
            <Button
              type="button"
              size="icon"
              variant={isRecording ? "destructive" : "ghost"}
              iconOnly
              leftIcon={<MicIcon className={isRecording ? "animate-pulse" : undefined} />}
              aria-label={isRecording ? "Detener grabación" : "Grabar audio"}
              aria-pressed={isRecording}
              disabled={isBusy}
              onClick={toggleRecording}
            />
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              onPaste={handleInputPaste}
              placeholder="Pregunta sobre Jelou AI… (Shift+Enter para salto de línea)"
              rows={1}
              className="field-sizing-content max-h-40 min-h-10 min-w-0 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              disabled={isBusy && cancellationState === "idle"}
            />
            {isBusy ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                iconOnly
                leftIcon={<SquareIcon className="size-3.5 fill-current" />}
                aria-label="Detener"
                onClick={requestCancellation}
              />
            ) : (
              <Button
                type="submit"
                size="icon"
                iconOnly
                leftIcon={<SendIcon />}
                aria-label="Enviar"
                disabled={!input.trim() && attachments.length === 0}
              />
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo cancelar la respuesta.";
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";
  const tone =
    status === "error"
      ? "bg-destructive"
      : isLive
        ? "bg-success"
        : status === "ready"
          ? "bg-muted-foreground"
          : "bg-muted-foreground/50";

  return (
    <span className="relative ml-1 flex size-1.5">
      {isLive ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            tone,
          )}
        />
      ) : null}
      <span
        className={cn(
          "relative inline-flex size-1.5 rounded-full transition-colors",
          tone,
        )}
      />
    </span>
  );
}
