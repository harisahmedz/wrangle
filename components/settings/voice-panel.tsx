"use client";

// Settings → Voice (ROADMAP-V3 §7/§8, S7): what the on-device voice model
// occupies and a button to remove it. lib/voice loads lazily so nothing from it
// sits in the Settings route's first-load chunks.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Status = { bytes: number | null };

export function VoicePanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    import("@/lib/voice/model").then((m) => {
      if (cancelled) return;
      const refresh = () =>
        m.voiceModelSizeBytes().then((bytes) => {
          if (!cancelled) setStatus({ bytes });
        });
      void refresh();
      window.addEventListener(m.VOICE_CHANGED_EVENT, refresh);
      cleanup = () => window.removeEventListener(m.VOICE_CHANGED_EVENT, refresh);
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  const remove = async () => {
    setRemoving(true);
    try {
      await (await import("@/lib/voice/model")).removeVoiceModel();
    } finally {
      setRemoving(false);
    }
  };

  const downloaded = (status?.bytes ?? 0) > 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-sm font-medium">Voice model (Whisper tiny, English)</p>
        <p className="text-xs text-muted">
          {status === null
            ? "Checking…"
            : downloaded
              ? `Downloaded, ${Math.round(status.bytes! / 1048576)} MB on this device.`
              : "Not downloaded. The Dump asks before the first download (about 57 MB)."}
        </p>
        {downloaded && (
          <Button variant="secondary" size="sm" className="ml-auto" onClick={remove} disabled={removing}>
            {removing ? "Removing…" : "Remove voice model"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">
        Recorded and uploaded voice notes are transcribed on this device, offline once the model is here. The audio
        is never stored or sent anywhere.
      </p>
    </div>
  );
}
