"use client";

// The user's AI mode (`users.prefs.ai.mode`) on the client. Mounted once in
// app/(app)/layout.tsx from `session.user.aiMode`; re-renders after Settings
// saves (the action calls `refresh()`). Tiny on purpose — it sits in the
// shared chunk, the providers don't.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { AiMode } from "@/lib/ai/types";

const AiModeContext = createContext<AiMode>("off");

let current: AiMode = "off";

/** Non-hook read for `runTask` (which is a plain async function, not a component). */
export function getAiMode(): AiMode {
  return current;
}

export function AiModeProvider({ mode, children }: { mode: AiMode; children: ReactNode }) {
  useEffect(() => {
    current = mode;
  }, [mode]);
  return <AiModeContext.Provider value={mode}>{children}</AiModeContext.Provider>;
}

export function useAiMode(): AiMode {
  return useContext(AiModeContext);
}
