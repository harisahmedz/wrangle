"use client";

// The Dump's voice-note controls (ROADMAP-V3 §7, S7): a record and an upload
// button for the capture row, and the panel under it (download consent,
// progress, "Transcribing…", errors). The logic lives in useVoiceNotes.
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/voice/audio";
import { MAX_RECORDING_SECONDS, VOICE_DOWNLOAD_MB } from "@/lib/voice/model";
import type { VoiceNotes } from "@/lib/voice/use-voice-notes";
import { cn } from "@/lib/utils";

const iconButton =
  "flex h-11 w-11 items-center justify-center rounded-full border transition-colors disabled:opacity-40";

function RecordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

type Props = { voice: VoiceNotes; offline: boolean };

export function VoiceButtons({ voice, offline, dictating }: Props & { dictating: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const recording = voice.phase === "recording";
  // Nothing new can be transcribed offline until the model has been downloaded once.
  const locked = offline && !voice.modelReady;
  const hint = locked ? "You're offline and the voice model isn't downloaded yet" : undefined;
  return (
    <>
      <button
        type="button"
        onClick={recording ? voice.stop : voice.record}
        aria-label={recording ? "Stop recording" : "Record a voice note"}
        aria-pressed={recording}
        disabled={!voice.supported || locked || dictating || voice.busy}
        title={!voice.supported ? "Recording isn't supported in this browser" : hint}
        className={cn(
          iconButton,
          recording ? "border-danger bg-danger/10 text-danger" : "border-border text-muted hover:text-text",
        )}
      >
        {recording ? <StopIcon className="h-5 w-5" /> : <RecordIcon className="h-5 w-5" />}
      </button>
      {recording && (
        <span role="status" className="text-xs tabular-nums text-danger">
          {formatClock(voice.seconds)} / {formatClock(MAX_RECORDING_SECONDS)}
        </span>
      )}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label="Upload audio"
        disabled={locked || dictating || voice.busy || recording}
        title={hint ?? "Upload an audio file"}
        className={cn(iconButton, "border-border text-muted hover:text-text")}
      >
        <UploadIcon className="h-5 w-5" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) voice.addAudio(file);
        }}
      />
    </>
  );
}

export function VoicePanel({ voice, offline }: Props) {
  if (voice.phase === "consent") {
    return (
      <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-sm">
        <p>
          Voice notes are transcribed on this device by a small speech model (Whisper). Download it once, about{" "}
          {VOICE_DOWNLOAD_MB} MB? Nothing you record leaves your device.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={voice.acceptDownload} disabled={offline}>
            Download
          </Button>
          <Button size="sm" variant="ghost" onClick={voice.dismiss}>
            Not now
          </Button>
          {offline && <span className="text-xs text-warning">You&apos;re offline.</span>}
        </div>
      </div>
    );
  }

  if (voice.phase === "downloading") {
    const loadedMb = Math.round((voice.progress?.loaded ?? 0) / 1048576);
    const pct = Math.min(100, Math.round((loadedMb / VOICE_DOWNLOAD_MB) * 100));
    return (
      <div className="mt-3 text-xs text-muted" role="status">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5">
          Downloading the voice model… {loadedMb} of about {VOICE_DOWNLOAD_MB} MB
        </p>
      </div>
    );
  }

  if (voice.phase === "decoding" || voice.phase === "transcribing") {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted" role="status">
        <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        Transcribing on this device…
      </p>
    );
  }

  if (voice.error) {
    return (
      <p role="alert" className="mt-3 text-xs text-danger">
        {voice.error}
      </p>
    );
  }

  if (voice.lastMs !== null) {
    return (
      <p role="status" className="mt-3 text-xs text-muted" data-voice-ms={voice.lastMs}>
        Transcribed on this device in {(voice.lastMs / 1000).toFixed(1)} s.
      </p>
    );
  }

  if (offline && !voice.modelReady) {
    return (
      <p className="mt-3 text-xs text-muted">
        You&apos;re offline and the voice model isn&apos;t downloaded yet. Record and upload will work once it has
        downloaded (about {VOICE_DOWNLOAD_MB} MB, once).
      </p>
    );
  }

  return null;
}
