"use client";

// "Is AI available right now?" for AI buttons (ROADMAP-V3 §8: disabled while
// offline). Combines the synced mode, the outbox's `offline` (the one source
// of truth for online-only controls) and a lazy probe of this device's
// providers. Re-probes when the mode or this device's providers change.
import { useEffect, useState } from "react";
import { useAiMode } from "@/lib/ai/mode";
import { AI_CHANGED_EVENT, type AiMode, type ProviderName } from "@/lib/ai/types";
import { useOutbox } from "@/lib/outbox/client";

export interface AiAvailability {
  /** mode != off, online, and a provider would answer. Gate every AI control on this. */
  available: boolean;
  mode: AiMode;
  /** Which provider the next `runTask` would try first; null while probing or when none. */
  provider: ProviderName | null;
  offline: boolean;
}

export function useAiAvailable(): AiAvailability {
  const mode = useAiMode();
  const { offline } = useOutbox();
  // Tagged with the mode it was probed for, so a mode change reads as "probing" until the new answer lands.
  const [probed, setProbed] = useState<{ mode: AiMode; provider: ProviderName | null } | null>(null);

  useEffect(() => {
    if (mode === "off") return;
    let cancelled = false;
    const probe = () => {
      import("@/lib/ai/browser")
        .then((m) => m.probeProvider(mode))
        .then((provider) => {
          if (!cancelled) setProbed({ mode, provider });
        })
        .catch(() => {
          if (!cancelled) setProbed({ mode, provider: null });
        });
    };
    probe();
    window.addEventListener(AI_CHANGED_EVENT, probe);
    return () => {
      cancelled = true;
      window.removeEventListener(AI_CHANGED_EVENT, probe);
    };
  }, [mode]);

  const provider = mode !== "off" && probed?.mode === mode ? probed.provider : null;
  return { available: mode !== "off" && !offline && provider !== null, mode, provider, offline };
}
