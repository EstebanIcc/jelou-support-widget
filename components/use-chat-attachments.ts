"use client";

import { useCallback, useRef, useState } from "react";

export type ChatAttachment = {
  id: string;
  url: string;
  filename: string;
  mediaType: string;
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
        list.map(async (file) => ({
          filename: file.name,
          id: nextId(),
          mediaType: file.type || "application/octet-stream",
          url: await readFileAsDataUrl(file),
        })),
      );
      setAttachments((prev) => [...prev, ...added]);
    } catch {
      setError("No se pudo adjuntar uno o más archivos.");
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
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
    error,
    isRecording,
    removeAttachment,
    toggleRecording,
  };
}
