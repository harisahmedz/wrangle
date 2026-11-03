"use client";

import { useEffect } from "react";

export function QuickAddTrigger({ prefill }: { prefill: string }) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("wrangle-quickadd", { detail: prefill }),
    );
    const url = new URL(window.location.href);
    ["quick", "title", "text", "link"].forEach((p) => url.searchParams.delete(p));
    window.history.replaceState(null, "", url.toString());
  }, [prefill]);
  return null;
}

/**
 * Opens the Dump from `/today?dump=1`, or with the audio file public/sw.js
 * stashed for `/today?voice=1` (the share target, V3 S7). Dispatched a tick
 * late so the lazily mounted sheet's listener (bottom-tabs.tsx) exists first.
 */
export function DumpTrigger({ sharedAudio }: { sharedAudio: boolean }) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("wrangle-dump", { detail: sharedAudio ? { sharedAudio: true } : undefined }),
      );
    }, 0);
    const url = new URL(window.location.href);
    ["dump", "voice"].forEach((p) => url.searchParams.delete(p));
    window.history.replaceState(null, "", url.toString());
    return () => window.clearTimeout(id);
  }, [sharedAudio]);
  return null;
}

export function ExpenseAddTrigger() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("wrangle-expense-add"));
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState(null, "", url.toString());
  }, []);
  return null;
}
