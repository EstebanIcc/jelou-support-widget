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
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
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
import { Message, MessageContent } from "@/components/ui/message";
import { cn } from "@/lib/utils";

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
  return <AgentChatInner key={generation} reportIdle={reportIdle} />;
}

function AgentChatInner({
  reportIdle,
}: {
  readonly reportIdle: (idle: boolean) => void;
}) {
  const [saved] = useState(() => readPersistedChat(STORAGE_KEY));
  const [session] = useState(() =>
    new Client({ host: "", preserveCompletedSessions: true }).session(
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
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  // El turno "user" que /api/escalations/respond inyecta al reanudar un escalamiento
  // no lo escribió el usuario — se oculta para que solo se vea la respuesta que el
  // agente genera a partir de él (ver lib/escalation.ts).
  const visibleMessages = agent.data.messages.filter(
    (message) => !isEscalationReplyMessage(message),
  );
  const isEmpty = visibleMessages.length === 0;
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
          <Conversation className="h-full min-h-0 flex-1">
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
          className="flex shrink-0 flex-col gap-2 border-t border-border py-4"
        >
          <ChatAttachmentList
            attachments={attachments}
            onRemove={removeAttachment}
            disabled={isBusy}
          />
          {attachmentError ? (
            <p className="text-xs text-destructive">{attachmentError}</p>
          ) : null}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Adjuntar archivo"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              <PaperclipIcon />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={isRecording ? "destructive" : "ghost"}
              aria-label={isRecording ? "Detener grabación" : "Grabar audio"}
              aria-pressed={isRecording}
              disabled={isBusy}
              onClick={toggleRecording}
            >
              <MicIcon className={isRecording ? "animate-pulse" : undefined} />
            </Button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
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
                aria-label="Detener"
                onClick={requestCancellation}
              >
                <SquareIcon className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                aria-label="Enviar"
                disabled={!input.trim() && attachments.length === 0}
              >
                <SendIcon />
              </Button>
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
