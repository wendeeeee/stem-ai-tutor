import { useCallback, useEffect, useRef, useState } from "react";

export const preferredMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export function supportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ??
    null
  );
}

export type RecorderStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "processing"
  | "unsupported"
  | "denied"
  | "error";

interface UseRecorderOptions {
  maxDurationMs: number;
  disabled: boolean;
  onRecording: (blob: Blob, durationMs: number) => void | Promise<void>;
}

export function useRecorder({
  maxDurationMs,
  disabled,
  onRecording,
}: UseRecorderOptions) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const cleanStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      setStatus("processing");
      recorder.stop();
    } else {
      cleanStream();
    }
  }, [cleanStream]);

  const start = useCallback(async () => {
    if (disabled || status === "requesting" || status === "recording") return;
    setError(null);
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus("unsupported");
      setError("This browser cannot record audio. Type your question instead.");
      return;
    }
    const mimeType = supportedMimeType();
    if (!mimeType) {
      setStatus("unsupported");
      setError(
        "This browser does not provide a supported recording format. Type your question instead.",
      );
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        cleanStream();
        setStatus("error");
        setError("Recording failed. Type your question or try again.");
      };
      recorder.onstop = () => {
        const durationMs = Math.max(1, Date.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        recorderRef.current = null;
        cleanStream();
        if (blob.size === 0) {
          setStatus("error");
          setError("No audio was captured. Please try again.");
          return;
        }
        setStatus("idle");
        void onRecording(blob, Math.min(durationMs, maxDurationMs));
      };
      startedAtRef.current = Date.now();
      recorder.start();
      setStatus("recording");
      timerRef.current = window.setTimeout(stop, maxDurationMs);
    } catch (reason: unknown) {
      cleanStream();
      const denied =
        reason instanceof DOMException &&
        (reason.name === "NotAllowedError" ||
          reason.name === "PermissionDeniedError");
      setStatus(denied ? "denied" : "error");
      setError(
        denied
          ? "Microphone permission was denied. You can still type your question."
          : "The microphone could not be opened. You can still type your question.",
      );
    }
  }, [cleanStream, disabled, maxDurationMs, onRecording, status, stop]);

  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      cleanStream();
    },
    [cleanStream],
  );

  return { status, error, start, stop };
}
