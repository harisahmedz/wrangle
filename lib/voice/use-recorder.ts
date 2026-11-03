"use client";

// MediaRecorder behind a small hook: start, a ticking clock, stop (by the user
// or at `maxSeconds`), then one Blob to `onStop`. Nothing is kept afterwards.
import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecordingMimeType } from "./audio";

export function useRecorder({ maxSeconds, onStop }: { maxSeconds: number; onStop: (blob: Blob) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const onStopRef = useRef(onStop);

  useEffect(() => {
    onStopRef.current = onStop;
  });

  const supported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (!supported || recorderRef.current) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser's site settings."
          : "No microphone could be opened.",
      );
      return;
    }
    const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      clearTimer();
      recorderRef.current = null;
      setRecording(false);
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (blob.size > 0) onStopRef.current(blob);
    };
    recorder.onerror = () => {
      setError("Recording failed.");
      if (recorder.state !== "inactive") recorder.stop();
    };
    recorderRef.current = recorder;
    const startedAt = performance.now();
    setSeconds(0);
    setRecording(true);
    recorder.start();
    timerRef.current = window.setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= maxSeconds) stop();
    }, 250);
  }, [supported, maxSeconds, stop]);

  // Unmount while recording: drop the audio and release the mic.
  useEffect(
    () => () => {
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
        recorder.stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
      }
    },
    [],
  );

  return { supported, recording, seconds, error, start, stop };
}
