"use client";

import { FileIcon, ImageIcon, MusicIcon, XIcon } from "lucide-react";

import type { ChatAttachment } from "@/components/use-chat-attachments";
import { cn } from "@/lib/utils";

export function ChatAttachmentList({
  attachments,
  onRemove,
  disabled,
  className,
}: {
  readonly attachments: readonly ChatAttachment[];
  readonly onRemove: (id: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2 pb-2", className)}>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex max-w-40 items-center gap-1.5 rounded-lg border border-input bg-muted/40 py-1 pl-1.5 pr-1 text-xs"
        >
          <AttachmentThumbnail attachment={attachment} />
          <span className="truncate">{attachment.filename}</span>
          <button
            type="button"
            aria-label={`Quitar ${attachment.filename}`}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            onClick={() => onRemove(attachment.id)}
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function AttachmentThumbnail({
  attachment,
}: {
  readonly attachment: ChatAttachment;
}) {
  if (attachment.mediaType.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        src={attachment.url}
        className="size-5 shrink-0 rounded object-cover"
      />
    );
  }

  const Icon = attachment.mediaType.startsWith("audio/") ? MusicIcon : FileIcon;
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
      <Icon className="size-3" />
    </span>
  );
}
