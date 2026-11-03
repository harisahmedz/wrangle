"use client";

// Voice notes for the Dump (ROADMAP-V3 §7, S7): record, upload or receive a
// shared audio file → decode on the main thread → Whisper in a worker → the
// transcript goes to `onTranscript`. The first use asks before the one-time
// model download; the audio itself is never stored or sent anywhere.
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeToWhisperPcm, WHISPER_SAMPLE_RATE } from "./audio";
import { isVoiceModelReady, markVoiceModelReady, MAX_RECORDING_SECONDS, VOICE_CHANGED_EVENT } from "./model";
import { disposeVoiceWorker, loadVoiceModel, transcribeAudio, type VoiceProgress } from "./transcriber";
import { useRecorder } from "./use-recorder";

export type VoicePhase = "idle" | "recording" | "consent" | "downloading" | "decoding" | "transcribing";

export type VoiceNotes = {
  phase: VoicePhase;
  /** Seconds recorded so far (while `phase === "recording"`). */
  seconds: number;
  progress: VoiceProgress | null;
  error: string | null;
  /** How long the last transcription took, for the "Transcribed in N s" line. */
  lastMs: number | null;
  modelReady: boolean;
  /** MediaRecorder + getUserMedia exist here. Upload works regardless. */
  supported: boolean;
  /** Decoding, downloading or transcribing: the other voice controls wait. */
  busy: boolean;
  record: () => void;
  stop: () => void;
  /** An uploaded file or a file shared into the app. */
  addAudio: (blob: Blob) => void;
  acceptDownload: () => void;
  dismiss: () => void;
  /** Stop everything and free the worker (the Dump closed). */
  reset: () => void;
};

export function useVoiceNotes({ onTranscript }: { onTranscript: (text: string) => void }): VoiceNotes {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [progress, setProgress] = useState<VoiceProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const pendingRef = useRef<Blob | null>(null);
  // Bumped by reset(); a run that wakes up to a newer generation stays quiet.
  const generationRef = useRef(0);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  useEffect(() => {
    const sync = () => setModelReady(isVoiceModelReady());
    sync();
    window.addEventListener(VOICE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(VOICE_CHANGED_EVENT, sync);
  }, []);

  const run = useCallback(async (blob: Blob) => {
    const generation = generationRef.current;
    const live = () => generationRef.current === generation;
    setError(null);
    setLastMs(null);
    setPhase("decoding");
    let pcm: Float32Array;
    try {
      pcm = await decodeToWhisperPcm(blob);
    } catch {
      if (!live()) return;
      setPhase("idle");
      setError("Couldn't read that audio. Try a WAV, MP3, M4A, OGG or WebM file.");
      return;
    }
    if (!live()) return;
    if (pcm.length < WHISPER_SAMPLE_RATE / 2) {
      setPhase("idle");
      setError("That recording is too short.");
      return;
    }
    setPhase("transcribing");
    try {
      const { text, ms } = await transcribeAudio(pcm, (p) => {
        if (!live()) return;
        setProgress(p);
        setPhase(p ? "downloading" : "transcribing");
      });
      if (!live()) return;
      markVoiceModelReady();
      setLastMs(ms);
      if (text) onTranscriptRef.current(text);
      else setError("No speech was recognised.");
    } catch (e) {
      if (!live()) return;
      setError(e instanceof Error && e.message ? `Transcription failed: ${e.message}` : "Transcription failed.");
    } finally {
      if (live()) {
        setPhase("idle");
        setProgress(null);
      }
    }
  }, []);

  const addAudio = useCallback(
    (blob: Blob) => {
      if (isVoiceModelReady()) {
        void run(blob);
        return;
      }
      pendingRef.current = blob;
      setError(null);
      setPhase("consent");
    },
    [run],
  );

  const recorder = useRecorder({ maxSeconds: MAX_RECORDING_SECONDS, onStop: addAudio });

  const acceptDownload = useCallback(async () => {
    const generation = generationRef.current;
    setPhase("downloading");
    setError(null);
    setProgress(null);
    try {
      await loadVoiceModel((p) => {
        if (generationRef.current === generation && p) setProgress(p);
      });
    } catch (e) {
      if (generationRef.current !== generation) return;
      pendingRef.current = null;
      setPhase("idle");
      setProgress(null);
      setError(
        e instanceof Error && e.message
          ? `Couldn't download the voice model: ${e.message}`
          : "Couldn't download the voice model.",
      );
      return;
    }
    if (generationRef.current !== generation) return;
    markVoiceModelReady();
    const blob = pendingRef.current;
    pendingRef.current = null;
    if (blob) await run(blob);
    else {
      setPhase("idle");
      setProgress(null);
    }
  }, [run]);

  const dismiss = useCallback(() => {
    pendingRef.current = null;
    setError(null);
    setPhase((current) => (current === "consent" ? "idle" : current));
  }, []);

  const { stop: stopRecording } = recorder;
  const reset = useCallback(() => {
    generationRef.current += 1;
    stopRecording();
    pendingRef.current = null;
    disposeVoiceWorker();
    setPhase("idle");
    setProgress(null);
    setError(null);
    setLastMs(null);
  }, [stopRecording]);

  return {
    phase: recorder.recording ? "recording" : phase,
    seconds: recorder.seconds,
    progress,
    error: error ?? recorder.error,
    lastMs,
    modelReady,
    supported: recorder.supported,
    busy: phase === "decoding" || phase === "downloading" || phase === "transcribing",
    record: () => void recorder.start(),
    stop: recorder.stop,
    addAudio,
    acceptDownload: () => void acceptDownload(),
    dismiss,
    reset,
  };
}
