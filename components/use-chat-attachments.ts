"use client";

import { useCallback, useRef, useState } from "react";

import { eveBackendUrl } from "@/lib/eve-backend-url";

export type ChatAttachment = {
  id: string;
  url: string;
  filename: string;
  mediaType: string;
  /**
   * URL pública permanente (CDN), solo presente cuando `mediaType` es una imagen y la
   * subida al backend (widget_back_end): /attachments/upload-image funcionó. `url` (Data URL) sigue siendo lo que
   * se manda al modelo para que "vea" la imagen — `mediaUrl` es lo que se manda además
   * como texto citable, para que el modelo pueda repetirlo si decide escalar el caso (ver
   * handleSubmit en chat-widget.tsx/agent-chat.tsx y el campo `imagenes` de
   * widget_back_end/agent/tools/escalar.ts). Si falta, el adjunto igual funciona para verlo en el chat,
   * solo que no se puede referenciar por URL en un escalamiento.
   */
  mediaUrl?: string;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

/**
 * Sube una imagen (Data URL) al backend (widget_back_end): /attachments/upload-image para conseguirle una URL
 * pública permanente. Nunca lanza: si falla (red, servicio caído, respuesta inesperada),
 * devuelve `undefined` y el adjunto sigue funcionando igual para verlo en el chat, solo
 * que sin URL citable para un escalamiento — no bloquea poder mandar el mensaje.
 */
async function uploadImageForPermanentUrl(dataUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(
      eveBackendUrl("/attachments/upload-image"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: dataUrl }),
      },
    );
    if (!response.ok) return undefined;
    const json = (await response.json()) as { ok?: boolean; mediaUrl?: string };
    return json.ok ? json.mediaUrl : undefined;
  } catch {
    return undefined;
  }
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function preferredAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

/**
 * Estado y acciones compartidas para adjuntar archivos (desde el explorador
 * del navegador) o grabar audio desde el micrófono, y convertirlos en
 * adjuntos listos para enviar como `UserContent` (parts tipo "file" con Data
 * URL) junto al mensaje de texto.
 */
export function useChatAttachments() {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [error, setError] = useState<string>();
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    setError(undefined);
    try {
      const added = await Promise.all(
        list.map(async (file) => {
          const mediaType = file.type || "application/octet-stream";
          const url = await readFileAsDataUrl(file);
          const mediaUrl = mediaType.startsWith("image/")
            ? await uploadImageForPermanentUrl(url)
            : undefined;
          return {
            filename: file.name,
            id: nextId(),
            mediaType,
            mediaUrl,
            url,
          };
        }),
      );
      setAttachments((prev) => [...prev, ...added]);
    } catch {
      setError("No se pudo adjuntar uno o más archivos.");
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  // Permite descartar el aviso de error (adjunto fallido, micrófono sin permiso, etc.)
  // a mano, sin esperar a que el próximo intento lo vuelva a pisar solo — ver el botón
  // de cerrar junto al mensaje en chat-widget.tsx/agent-chat.tsx.
  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    setError(undefined);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite grabar audio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = preferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        for (const track of streamRef.current?.getTracks() ?? []) {
          track.stop();
        }
        streamRef.current = null;

        if (blob.size === 0) return;

        const extension = blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `audio-${Date.now()}.${extension}`, {
          type: blob.type,
        });
        void addFiles([file]);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
      setIsRecording(false);
    }
  }, [addFiles, isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    addFiles,
    attachments,
    clearAttachments,
    clearError,
    error,
    isRecording,
    removeAttachment,
    toggleRecording,
  };
}
