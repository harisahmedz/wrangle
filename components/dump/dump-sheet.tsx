"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  listExpenseCategoriesForDump,
  listLearningTopicsForDump,
  saveDump,
} from "@/lib/actions/dump";
import { isoDateKey, parseDump, type DumpItem } from "@/lib/dump/parser";
import { useSpeech } from "@/lib/dump/use-speech";
import { parseAmountToMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  BUCKET_ORDER,
  TrayRowItem,
  type TrayRow,
} from "@/components/dump/tray-row";

const MAX_DUMP_CHARS = 2000;

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function toRow(item: DumpItem, tz: string): TrayRow {
  const today = isoDateKey(new Date(), tz);
  const base = {
    id: item.id,
    title: "",
    dueAt: null as Date | null,
    isAllDay: false,
    amountMinor: null as number | null,
    spentOn: today,
    minutes: 30,
  };
  switch (item.kind) {
    case "task":
      return { ...base, kind: "task", title: item.title, dueAt: item.dueAt, isAllDay: item.isAllDay };
    case "idea":
      return { ...base, kind: "idea", title: item.title };
    case "expense":
      return { ...base, kind: "expense", title: item.note, amountMinor: item.amountMinor, spentOn: item.spentOn };
    case "learning":
      return { ...base, kind: "learning", title: item.topic, minutes: item.minutes };
  }
}

function MicIcon({ className }: { className?: string }) {
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
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function DumpSheet() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"capture" | "tray">("capture");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<TrayRow[]>([]);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [categorySel, setCategorySel] = useState<Record<string, string>>({});
  const [topicSel, setTopicSel] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [topics, setTopics] = useState<{ id: string; title: string }[]>([]);
  const [optionsState, setOptionsState] = useState<"idle" | "loading" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pushToast = useToast();
  const suppressFinalizeRef = useRef(false);
  const [listenBase, setListenBase] = useState("");
  const speech = useSpeech({
    onFinalize: (finalText) => {
      if (suppressFinalizeRef.current) return;
      const merged = listenBase ? `${listenBase} ${finalText}` : finalText;
      setText(merged.slice(0, MAX_DUMP_CHARS));
      setListenBase("");
    },
  });
  const [tz, setTz] = useState("UTC");

  useEffect(() => {
    const onDump = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      suppressFinalizeRef.current = false;
      setOpen(true);
      setStage("capture");
      setText(typeof detail === "string" ? detail : "");
      setRows([]);
      setAmountDrafts({});
      setCategorySel({});
      setTopicSel({});
      setError(null);
      setTz(detectTimezone());
    };
    window.addEventListener("wrangle-dump", onDump);
    return () => window.removeEventListener("wrangle-dump", onDump);
  }, []);

  const closeAll = () => {
    suppressFinalizeRef.current = true;
    speech.stop();
    setOpen(false);
    setStage("capture");
    setText("");
    setRows([]);
    setAmountDrafts({});
    setCategorySel({});
    setTopicSel({});
    setError(null);
  };

  const toggleMic = () => {
    if (!speech.supported) return;
    if (speech.listening) {
      speech.stop();
      return;
    }
    suppressFinalizeRef.current = false;
    setListenBase(text);
    speech.start();
  };

  const loadOptions = () => {
    if (optionsState !== "idle") return;
    setOptionsState("loading");
    startTransition(async () => {
      const [cats, tops] = await Promise.all([
        listExpenseCategoriesForDump(),
        listLearningTopicsForDump(),
      ]);
      if (cats.ok) setCategories(cats.data);
      if (tops.ok) setTopics(tops.data);
      setOptionsState("ready");
    });
  };

  const openTray = () => {
    const source = text.trim();
    if (!source) return;
    const parsed = parseDump(source, { now: new Date(), tz });
    const items =
      parsed.length > 0
        ? parsed
        : [
            {
              id: "seg-0",
              kind: "task" as const,
              title: source.slice(0, 300),
              dueAt: null,
              isAllDay: false,
            },
          ];
    const nextRows = items.map((item) => toRow(item, tz));
    const drafts: Record<string, string> = {};
    for (const row of nextRows) {
      if (row.kind === "expense" && row.amountMinor != null) {
        drafts[row.id] = String(row.amountMinor / 100);
      }
    }
    setRows(nextRows);
    setAmountDrafts(drafts);
    setError(null);
    setStage("tray");
    loadOptions();
  };

  const patchRow = (rowId: string, patch: Partial<TrayRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    );
  };

  const recastRow = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const idx = BUCKET_ORDER.findIndex((b) => b.kind === r.kind);
        const nextKind = BUCKET_ORDER[(idx + 1) % BUCKET_ORDER.length].kind;
        return { ...r, kind: nextKind };
      }),
    );
  };

  const changeAmount = (rowId: string, value: string) => {
    setAmountDrafts((prev) => ({ ...prev, [rowId]: value }));
    const minor = parseAmountToMinor(value.replace(",", "."));
    patchRow(rowId, { amountMinor: minor != null && minor > 0 ? minor : null });
  };

  const rowErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const row of rows) {
      if (!row.title.trim()) {
        errs[row.id] =
          row.kind === "expense"
            ? "Add a note"
            : row.kind === "learning"
              ? "Add a topic"
              : "Add a title";
      } else if (row.kind === "expense" && (!row.amountMinor || row.amountMinor <= 0)) {
        errs[row.id] = "Enter an amount";
      }
    }
    return errs;
  }, [rows]);

  const hasErrors = Object.keys(rowErrors).length > 0;

  const submit = () => {
    if (!rows.length || hasErrors || pending) return;
    const payload = rows.map((row) => {
      if (row.kind === "task") {
        return {
          kind: "task" as const,
          title: row.title.trim(),
          dueAtIso: row.dueAt ? row.dueAt.toISOString() : null,
          isAllDay: row.isAllDay,
        };
      }
      if (row.kind === "idea") {
        return { kind: "idea" as const, title: row.title.trim() };
      }
      if (row.kind === "expense") {
        return {
          kind: "expense" as const,
          amountMinor: row.amountMinor ?? 0,
          note: row.title.trim(),
          spentOn: row.spentOn,
          categoryId: categorySel[row.id] || undefined,
        };
      }
      return {
        kind: "learning" as const,
        minutes: row.minutes,
        topic: row.title.trim(),
        learningItemId: topicSel[row.id] || undefined,
      };
    });
    startTransition(async () => {
      const res = await saveDump(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      pushToast({ message: res.data.summary });
      closeAll();
    });
  };

  const displayText = speech.listening
    ? [listenBase, speech.interim].filter(Boolean).join(" ")
    : text;

  return (
    <Sheet open={open} onClose={closeAll} label="The Dump">
      {stage === "capture" ? (
        <div>
          <h2 className="mb-1 text-lg font-semibold">The Dump</h2>
          <p className="mb-4 text-xs text-muted">
            Say or paste anything — Wrangle sorts it into tasks, expenses, ideas and learning.
          </p>
          <textarea
            autoFocus
            value={displayText}
            onChange={(e) => {
              setText(e.target.value);
              if (speech.listening) setListenBase(e.target.value);
            }}
            maxLength={MAX_DUMP_CHARS}
            rows={5}
            placeholder="Say or paste anything…"
            aria-label="Brain dump"
            className="w-full rounded-lg border border-border bg-surface-2 p-3 text-base placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
                aria-pressed={speech.listening}
                title={speech.supported ? undefined : "Voice input not supported in this browser"}
                disabled={!speech.supported}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
                  speech.listening
                    ? "border-danger bg-danger/10 text-danger"
                    : "border-border text-muted hover:text-text",
                  !speech.supported && "opacity-40",
                )}
              >
                <MicIcon className="h-5 w-5" />
              </button>
              {speech.listening && (
                <span className="flex items-center gap-1.5 text-xs text-danger" role="status">
                  <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-danger" />
                  Listening…
                </span>
              )}
            </div>
            <span className="text-xs text-muted">
              {text.length}/{MAX_DUMP_CHARS}
            </span>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeAll}
              className="min-h-[44px] px-3 py-2 text-sm text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={openTray}
              disabled={!text.trim()}
              className="min-h-[44px] rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              Sort it →
            </button>
          </div>
        </div>
      ) : (
        <div>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Sorted — {rows.length} {rows.length === 1 ? "thing" : "things"}
            </h2>
            <button
              type="button"
              onClick={closeAll}
              aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:text-text"
            >
              <span aria-hidden="true" className="text-lg leading-none">✕</span>
            </button>
          </header>

          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-danger bg-surface-2 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {rows.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
              Nothing left here — everything was removed.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <TrayRowItem
                  key={row.id}
                  row={row}
                  rowError={rowErrors[row.id]}
                  amountValue={amountDrafts[row.id] ?? ""}
                  topics={topics}
                  topicsReady={optionsState === "ready"}
                  categories={categories}
                  categoriesReady={optionsState === "ready"}
                  categoryValue={categorySel[row.id] ?? ""}
                  topicValue={topicSel[row.id] ?? ""}
                  disabled={pending}
                  onPatch={(patch) => patchRow(row.id, patch)}
                  onRecast={() => recastRow(row.id)}
                  onRemove={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  onAmountChange={(value) => changeAmount(row.id, value)}
                  onCategoryChange={(value) =>
                    setCategorySel((prev) => ({ ...prev, [row.id]: value }))
                  }
                  onTopicChange={(value) =>
                    setTopicSel((prev) => ({ ...prev, [row.id]: value }))
                  }
                />
              ))}
            </ul>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeAll}
              className="min-h-[44px] px-3 py-2 text-sm text-muted hover:text-text"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || hasErrors || rows.length === 0}
              className="min-h-[44px] rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {pending
                ? "Filing…"
                : `Save all ${rows.length}`}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
