"use client";

// Settings → AI (ROADMAP-V3 §4, §4.1, S0): the synced mode, this device's
// providers (Gemini Nano, the user's own OpenRouter key), a Test button and
// the privacy text. The heavy provider code loads via import(); the key never
// leaves this device (lib/ai/key-store.ts). Every control is disabled while
// the outbox says we're offline.
import { useEffect, useState, useTransition } from "react";
import { setAiMode } from "@/lib/actions/settings";
import type { AiStatus } from "@/lib/ai/browser";
import { forgetKey, saveKey } from "@/lib/ai/key-store";
import { beginConnect, OPENROUTER_MANAGE_KEYS_URL } from "@/lib/ai/pkce";
import { AI_CHANGED_EVENT, type AiMode, type RunFailReason } from "@/lib/ai/types";
import { useOutbox } from "@/lib/outbox/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MODES: { value: AiMode; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "No AI. Everything works as it does today." },
  {
    value: "on-device",
    label: "On-device only",
    description: "Gemini Nano in desktop Chrome or Edge. Text never leaves this device.",
  },
  {
    value: "on-device-then-openrouter",
    label: "On-device, then OpenRouter",
    description: "Uses your own OpenRouter key when Nano isn't available (Android, iOS, other browsers).",
  },
];

const NANO_TEXT: Record<AiStatus["nano"], string> = {
  available: "Available in this browser.",
  downloadable: "Supported here, but the model isn't downloaded yet.",
  downloading: "Downloading the model…",
  unavailable: "Not available in this browser (desktop Chrome or Edge only).",
};

const FAIL_TEXT: Record<RunFailReason, string> = {
  off: "AI is off. Pick a mode first.",
  offline: "You're offline.",
  "no-provider": "Nothing can answer: Nano isn't available here and no OpenRouter key is connected.",
  budget: "The test input was over budget.",
  timeout: "Timed out after 8 s.",
  invalid: "The model never returned valid JSON.",
  auth: "OpenRouter rejected the key. Reconnect or paste a new one.",
  aborted: "Cancelled.",
  error: "The provider returned an error.",
};

type TestState = { state: "idle" } | { state: "running" } | { state: "done"; ok: boolean; message: string };

export function AiPanel({ mode: initialMode }: { mode: AiMode }) {
  const { offline } = useOutbox();
  const [mode, setMode] = useState<AiMode>(initialMode);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [status, setStatus] = useState<AiStatus | null>(null);
  const [download, setDownload] = useState<{ progress: number } | { error: string } | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ state: "idle" });

  // This device's providers: on mount, whenever the key/Nano changes, and when
  // the tab comes back (an installed PWA may finish the PKCE round trip in
  // another browsing context).
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      import("@/lib/ai/browser")
        .then((m) => m.aiStatus())
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {});
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(AI_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(AI_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const choose = (next: AiMode) => {
    setMode(next);
    setSaved(false);
    setSaveError(null);
    const fd = new FormData();
    fd.set("mode", next);
    startTransition(async () => {
      const res = await setAiMode(fd);
      if (res.ok) setSaved(true);
      else setSaveError(res.error);
    });
  };

  const connect = async () => {
    setConnectError(null);
    try {
      window.location.assign(await beginConnect(window.location.origin));
    } catch {
      setConnectError("Could not start the OpenRouter sign-in. You can paste a key instead.");
    }
  };

  const savePasted = async () => {
    const key = pasteValue.trim();
    if (!key.startsWith("sk-or-")) {
      setPasteError("That doesn't look like an OpenRouter key (they start with sk-or-).");
      return;
    }
    try {
      await saveKey({ key, source: "paste", connectedAt: Date.now() });
      setPasteValue("");
      setPasteError(null);
      setPasteOpen(false);
    } catch {
      setPasteError("Could not store the key in this browser.");
    }
  };

  const revoke = async () => {
    setTest({ state: "idle" });
    await forgetKey().catch(() => {});
  };

  const downloadNano = async () => {
    setDownload({ progress: 0 });
    try {
      const nano = await import("@/lib/ai/nano");
      const model = nano.getNanoModel();
      if (!model) throw new Error("unavailable");
      await nano.downloadNano(model, (progress) => setDownload({ progress }));
      setDownload(null);
      window.dispatchEvent(new Event(AI_CHANGED_EVENT));
    } catch {
      setDownload({ error: "The download didn't start. Chrome needs a supported GPU and about 22 GB free." });
    }
  };

  const runTest = () => {
    setTest({ state: "running" });
    Promise.all([import("@/lib/ai"), import("@/lib/ai/tasks/ping")])
      .then(async ([ai, ping]) => {
        const r = await ai.runTask(ping.pingTask, ping.PING_INPUT, { mode });
        if (!r.ok) {
          setTest({ state: "done", ok: false, message: FAIL_TEXT[r.reason] + (r.detail ? ` (${r.detail})` : "") });
          return;
        }
        const via = r.provider === "nano" ? "Gemini Nano" : `OpenRouter (${r.model ?? "default model"})`;
        const seconds = (r.ms / 1000).toFixed(1);
        setTest(
          r.data.pick === ping.PING_ANSWER
            ? { state: "done", ok: true, message: `Worked via ${via} in ${seconds} s.` }
            : {
                state: "done",
                ok: false,
                message: `${via} replied in ${seconds} s but picked the wrong word. The app's checks would have discarded it.`,
              },
        );
      })
      .catch(() => setTest({ state: "done", ok: false, message: "Couldn't load the AI code." }));
  };

  const connected = status?.key ?? null;
  const connectedLabel = connected
    ? `Connected ${connected.source === "pkce" ? "via OpenRouter sign-in" : "with a pasted key"} on ${new Date(
        connected.connectedAt,
      ).toLocaleDateString(undefined, { dateStyle: "medium" })}.`
    : "Not connected.";

  return (
    <div className="space-y-5">
      {offline && (
        <p className="text-xs text-warning" role="status">
          You&apos;re offline. AI settings need a connection.
        </p>
      )}

      <div>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {MODES.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent",
                mode === option.value ? "border-accent bg-accent/10" : "border-border hover:bg-surface-2",
                offline && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="ai-mode"
                value={option.value}
                checked={mode === option.value}
                disabled={offline}
                onChange={() => choose(option.value)}
                className="sr-only"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        <p aria-live="polite" className="mt-2 min-h-4 text-xs text-muted">
          {pending ? "Saving…" : (saveError ?? (saved ? "Saved" : ""))}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-sm font-medium">Gemini Nano (on-device)</p>
          <p className="text-xs text-muted">
            {status === null
              ? "Checking…"
              : download && "progress" in download
                ? `Downloading… ${Math.round(download.progress * 100)}%`
                : NANO_TEXT[status.nano]}
          </p>
          {status?.nano === "downloadable" && !(download && "progress" in download) && (
            <Button variant="secondary" size="sm" className="ml-auto" onClick={downloadNano} disabled={offline}>
              Download
            </Button>
          )}
        </div>
        {download && "error" in download && <p className="text-xs text-danger">{download.error}</p>}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-sm font-medium">OpenRouter (your key)</p>
          <p className="text-xs text-muted">{status === null ? "Checking…" : connectedLabel}</p>
          {status !== null &&
            (connected ? (
              <Button variant="secondary" size="sm" className="ml-auto" onClick={revoke} disabled={offline}>
                Revoke
              </Button>
            ) : (
              <Button size="sm" className="ml-auto" onClick={connect} disabled={offline}>
                Connect OpenRouter
              </Button>
            ))}
        </div>
        {connectError && <p className="text-xs text-danger">{connectError}</p>}
        {connected ? (
          <p className="text-xs text-muted">
            Revoke removes the key from this device. Also delete it at{" "}
            <a
              href={OPENROUTER_MANAGE_KEYS_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-text"
            >
              openrouter.ai/settings/keys
            </a>
            . Set a credit limit on the key; Wrangle only uses free models.
          </p>
        ) : status !== null && !pasteOpen ? (
          <button
            type="button"
            onClick={() => setPasteOpen(true)}
            disabled={offline}
            className="text-xs text-muted underline underline-offset-2 hover:text-text disabled:opacity-50"
          >
            Paste a key instead
          </button>
        ) : status !== null ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="OpenRouter API key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-v1-…"
              value={pasteValue}
              disabled={offline}
              onChange={(e) => {
                setPasteValue(e.target.value);
                setPasteError(null);
              }}
            />
            <Button size="sm" onClick={savePasted} disabled={offline || !pasteValue.trim()}>
              Save key
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
          </div>
        ) : null}
        {pasteError && <p className="text-xs text-danger">{pasteError}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={runTest}
          disabled={offline || mode === "off" || test.state === "running"}
        >
          {test.state === "running" ? "Testing…" : "Test AI"}
        </Button>
        <p aria-live="polite" className={cn("text-xs", test.state === "done" && !test.ok ? "text-danger" : "text-muted")}>
          {test.state === "done" ? test.message : mode === "off" ? "Pick a mode to test it." : ""}
        </p>
      </div>

      <div className="space-y-1 text-xs text-muted">
        <p>On-device mode keeps the text on this device.</p>
        <p>
          OpenRouter mode sends the task text to OpenRouter and the free provider that serves it; free providers may
          log it. Money tasks send only a merchant or note, never amounts or history.
        </p>
        <p>
          Your key is stored only in this browser and goes straight to openrouter.ai. It never reaches Wrangle&apos;s
          servers, so each device connects separately.
        </p>
      </div>
    </div>
  );
}
