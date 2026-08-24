"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const VISITS_KEY = "wrangle-visits";
const DISMISSED_KEY = "wrangle-install-dismissed";
const IOS_HINT_KEY = "wrangle-ios-hint-shown";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari
    Boolean(window.navigator.standalone)
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isStandalone()) return;

    let visits = 0;
    try {
      visits = Number(localStorage.getItem(VISITS_KEY) ?? "0") + 1;
      localStorage.setItem(VISITS_KEY, String(visits));
      const dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
      const iosShown = localStorage.getItem(IOS_HINT_KEY) === "1";

      const onBip = (e: Event) => {
        e.preventDefault();
        setDeferred(e as BeforeInstallPromptEvent);
        if (!dismissed && visits >= 2) setShowAndroid(true);
      };
      window.addEventListener("beforeinstallprompt", onBip);

      if (isIos() && !iosShown && !dismissed) {
        setTimeout(() => setShowIosHint(true), 0);
        try {
          localStorage.setItem(IOS_HINT_KEY, "1");
        } catch {}
      }

      return () => window.removeEventListener("beforeinstallprompt", onBip);
    } catch {
      return;
    }
  }, []);

  const dismiss = () => {
    setShowAndroid(false);
    setShowIosHint(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  if (!mounted || isStandalone()) return null;

  return (
    <>
      {showAndroid && deferred && (
        <div className="fixed inset-x-0 bottom-24 z-[85] flex justify-center px-4 md:bottom-6">
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-lg">
            <span aria-hidden>📲</span>
            <span>Install Wrangle on your phone</span>
            <button
              onClick={() => void install()}
              className="font-semibold text-accent-strong hover:underline"
            >
              Install
            </button>
            <button
              onClick={dismiss}
              aria-label="Dismiss install banner"
              className="text-muted hover:text-text"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {showIosHint && (
        <div className="fixed inset-x-0 bottom-24 z-[85] flex justify-center px-4 md:bottom-6">
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 text-xs shadow-lg">
            <span>
              📲 <b>Add to Home Screen:</b> Share <span aria-hidden>→</span> Add to Home Screen
            </span>
            <button
              onClick={dismiss}
              aria-label="Dismiss hint"
              className="font-semibold text-accent-strong"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
