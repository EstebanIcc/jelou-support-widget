"use client";

import { Loader2Icon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { JelouIsotype } from "@/components/ui/jelou-isotype";
import type { ConversationSummary } from "@/lib/conversation-history";

/**
 * Timestamps de ClickHouse llegan como "YYYY-MM-DD HH:mm:ss.SSS" (UTC, sin "Z" — ver
 * toClickhouseDateTime en agent/lib/clickhouse.ts de widget_back_end), no ISO 8601
 * directo: hay que agregarle la "T" y la "Z" antes de que `Date` lo parsee, si no lo
 * interpreta como hora local del navegador.
 */
function formatRelativeTime(rawTimestamp: string): string {
  const iso = rawTimestamp.includes("T") ? rawTimestamp : `${rawTimestamp.replace(" ", "T")}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 1) return "Ahora";
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;

  const diffDays = Math.round(diffHours / 24);
  return diffDays <= 1 ? "Hace 1 día" : `Hace ${diffDays} días`;
}

export type ConversationListStatus = "idle" | "loading" | "ready" | "error";

/**
 * Vista "Mensajes" (lista de conversaciones) del widget, tipo Intercom — ver el bloque
 * que la abre/cierra en chat-widget.tsx (view === "list") y por qué solo llega a
 * existir la lista si hay `email` (GET /conversations necesita identificar al
 * visitante, ver lib/conversation-history.ts).
 */
export function ConversationList({
  conversations,
  onRetry,
  onSelect,
  resumingSessionId,
  status,
}: {
  readonly conversations: readonly ConversationSummary[];
  readonly onRetry: () => void;
  readonly onSelect: (sessionId: string) => void;
  readonly resumingSessionId: string | null;
  readonly status: ConversationListStatus;
}) {
  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2Icon
          className="size-5 animate-spin"
          style={{ color: "var(--widget-text-faint)" }}
        />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-xs" style={{ color: "var(--widget-text-muted)" }}>
          No pudimos cargar tus conversaciones anteriores.
        </p>
        <button
          className="text-xs font-medium underline-offset-2 hover:underline"
          onClick={onRetry}
          style={{ color: "var(--widget-accent)" }}
          type="button"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-xs" style={{ color: "var(--widget-text-muted)" }}>
          No tenés conversaciones anteriores.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conversation) => (
        <button
          className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-[var(--widget-border-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={resumingSessionId !== null}
          key={conversation.sessionId}
          onClick={() => onSelect(conversation.sessionId)}
          style={{ borderBottom: "1px solid var(--widget-border-soft)" }}
          type="button"
        >
          {/* Avatar "default" (32px) en vez de "sm" (24px) para agrandar el isotipo,
              igual que en el header del widget (ver chat-widget.tsx). */}
          <Avatar size="default">
            <AvatarFallback className="bg-transparent">
              <JelouIsotype size={24} />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-xs" style={{ color: "var(--widget-text)" }}>
              {conversation.lastMessage || "Conversación sin mensajes de texto"}
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--widget-text-faint)" }}>
              {formatRelativeTime(conversation.startedAt)}
            </p>
          </div>
          {resumingSessionId === conversation.sessionId ? (
            <Loader2Icon
              className="mt-1 size-3.5 shrink-0 animate-spin"
              style={{ color: "var(--widget-text-faint)" }}
            />
          ) : null}
        </button>
      ))}
    </div>
  );
}
