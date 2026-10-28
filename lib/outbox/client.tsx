"use client";

// Browser wiring for the outbox (docs/OFFLINE-OUTBOX.md §2.2, §4.2, §7):
// the provider (mounted in app/(app)/layout.tsx) owns one `createOutbox`
// per signed-in user, drives it from the online/visibility/mount triggers,
// renders the offline banner + the review sheet, and exposes `useOutbox()`.
// `lib/mutations`' `mutate()` reaches the active instance through
// `enqueueMutation` so call sites stay plain function calls.
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { createOutbox, type Outbox, type OutboxEvent, type OutboxState, type SendOutcome } from "@/lib/outbox/core";
import { idbStore } from "@/lib/outbox/db";
import { describeMutation } from "@/lib/outbox/overlay";
import {
  OUTBOX_TIMEOUT_MS,
  type Mutation,
  type OutboxBatch,
  type OutboxEntry,
  type OutboxResponse,
} from "@/lib/outbox/types";

export const OUTBOX_REVIEW_EVENT = "wrangle-outbox-review";

type OutboxContextValue = {
  offline: boolean;
  syncing: boolean;
  /** Every entry, all statuses — what the overlays consume. */
  entries: OutboxEntry[];
  /** pending + inflight + applied (not yet settled). */
  pending: OutboxEntry[];
  failed: OutboxEntry[];
  retry(id: string): void;
  discard(id: string): void;
  discardAll(): void;
  drain(): void;
  openReview(): void;
};

const noop = () => {};
const EMPTY: OutboxContextValue = {
  offline: false,
  syncing: false,
  entries: [],
  pending: [],
  failed: [],
  retry: noop,
  discard: noop,
  discardAll: noop,
  drain: noop,
  openReview: noop,
};

const OutboxContext = createContext<OutboxContextValue>(EMPTY);

export function useOutbox(): OutboxContextValue {
  return useContext(OutboxContext);
}

let active: Outbox | null = null;
let persistRequested = false;

/** What `lib/mutations`' `mutate()` calls. Resolves once the entry is stored on this device. */
export async function enqueueMutation(mutation: Mutation, label?: string): Promise<string | null> {
  if (!active) return null;
  if (!persistRequested) {
    persistRequested = true;
    // Best-effort: reduces iOS eviction risk for browser-tab installs (§3).
    void navigator.storage?.persist?.().catch(() => {});
  }
  return active.enqueue(mutation, label);
}

async function sendBatch(batch: OutboxBatch): Promise<SendOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OUTBOX_TIMEOUT_MS);
  try {
    const res = await fetch("/api/outbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch),
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!res.ok) {
      // A 500 mid-batch carries the partial results (see app/api/outbox/route.ts).
      const partial = await res.json().then((d: Partial<OutboxResponse>) => d.results).catch(() => undefined);
      return { kind: "http", status: res.status, results: Array.isArray(partial) ? partial : undefined };
    }
    const data = (await res.json()) as Partial<OutboxResponse>;
    return { kind: "ok", results: Array.isArray(data.results) ? data.results : [] };
  } catch {
    return { kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function withNavigatorLock<T>(fn: () => Promise<T>): Promise<T> {
  // Safari ≥ 15.4; without it a double send is harmless (the server is idempotent).
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("wrangle-outbox", fn) as Promise<T>;
  }
  return fn();
}

export function OutboxProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const router = useRouter();
  const pushToast = useToast();
  const [state, setState] = useState<OutboxState>({ entries: [], syncing: false, authPaused: false });
  // §7: the one source of truth for "offline" inside the app shell.
  const offline = useSyncExternalStore(subscribeOnline, () => !navigator.onLine, () => false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [refreshPending, startRefresh] = useTransition();
  const outboxRef = useRef<Outbox | null>(null);
  const settleAfterRefresh = useRef(false);
  const failureToasted = useRef(false);
  const pushToastRef = useRef(pushToast);
  useEffect(() => {
    pushToastRef.current = pushToast;
  }, [pushToast]);

  useEffect(() => {
    const onEvent = (event: OutboxEvent) => {
      const outbox = outboxRef.current;
      if (!outbox) return;
      if (event.type === "applied") {
        // §2.3 snap-back avoidance: keep the applied entries overlaid until
        // the RSC refetch has landed, then delete them (see the effect on
        // `refreshPending` below). Skipped offline — there's nothing to fetch.
        if (navigator.onLine) {
          settleAfterRefresh.current = true;
          startRefresh(() => router.refresh());
        } else {
          void outbox.settle();
        }
      } else if (event.type === "dropped") {
        const [first, ...rest] = event.reasons;
        pushToastRef.current({
          message: rest.length ? `${first}, and ${rest.length} more change${rest.length === 1 ? "" : "s"} skipped` : `${first}, change skipped`,
        });
      } else if (event.type === "failed" && !failureToasted.current) {
        failureToasted.current = true;
        pushToastRef.current({
          message: "A change couldn't sync",
          actionLabel: "Review",
          onAction: () => setReviewOpen(true),
        });
      }
    };

    const outbox = createOutbox({
      userId,
      store: idbStore(),
      send: sendBatch,
      isOnline: () => navigator.onLine,
      lock: withNavigatorLock,
      onEvent,
    });
    outboxRef.current = outbox;
    active = outbox;
    const unsubscribe = outbox.subscribe(setState);
    void outbox.start().then(() => outbox.drain());

    const goOnline = () => void outbox.drain();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void outbox.reload().then((droppedLocally) => {
        // Another tab drained and settled entries this tab was still
        // overlaying: refetch so the page shows the server's version of
        // them instead of snapping back to the pre-change state.
        if (droppedLocally > 0 && navigator.onLine) startRefresh(() => router.refresh());
        return outbox.drain();
      });
    };
    const onReview = () => setReviewOpen(true);
    window.addEventListener("online", goOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(OUTBOX_REVIEW_EVENT, onReview);
    return () => {
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(OUTBOX_REVIEW_EVENT, onReview);
      unsubscribe();
      outbox.stop();
      if (active === outbox) active = null;
      outboxRef.current = null;
    };
  }, [userId, router]);

  useEffect(() => {
    if (refreshPending || !settleAfterRefresh.current) return;
    settleAfterRefresh.current = false;
    void outboxRef.current?.settle();
  }, [refreshPending]);

  const failed = useMemo(() => state.entries.filter((e) => e.status === "failed"), [state.entries]);
  const pending = useMemo(() => state.entries.filter((e) => e.status !== "failed"), [state.entries]);
  // One toast per run of failures (§7): re-arm once the sheet is empty again.
  useEffect(() => {
    if (failed.length === 0) failureToasted.current = false;
  }, [failed.length]);

  const retry = useCallback((id: string) => void outboxRef.current?.retry(id), []);
  const discard = useCallback((id: string) => void outboxRef.current?.discard(id), []);
  const discardAll = useCallback(() => void outboxRef.current?.discardAll(), []);
  const drain = useCallback(() => void outboxRef.current?.drain(), []);
  const openReview = useCallback(() => setReviewOpen(true), []);

  const value = useMemo<OutboxContextValue>(
    () => ({
      offline,
      syncing: state.syncing,
      entries: state.entries,
      pending,
      failed,
      retry,
      discard,
      discardAll,
      drain,
      openReview,
    }),
    [offline, state.syncing, state.entries, pending, failed, retry, discard, discardAll, drain, openReview],
  );

  return (
    <OutboxContext.Provider value={value}>
      {children}
      <OutboxBanner
        offline={offline}
        syncing={state.syncing}
        pendingCount={pending.length}
        failedCount={failed.length}
        authPaused={state.authPaused}
        onReview={openReview}
      />
      <ReviewSheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        failed={failed}
        retry={retry}
        discard={discard}
        discardAll={discardAll}
      />
    </OutboxContext.Provider>
  );
}

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function OutboxBanner({
  offline,
  syncing,
  pendingCount,
  failedCount,
  authPaused,
  onReview,
}: {
  offline: boolean;
  syncing: boolean;
  pendingCount: number;
  failedCount: number;
  authPaused: boolean;
  onReview: () => void;
}) {
  // "Syncing N…" only once a drain has run for more than a second (§7).
  const [slowSync, setSlowSync] = useState(false);
  useEffect(() => {
    if (!syncing) return;
    const t = setTimeout(() => setSlowSync(true), 1_000);
    return () => {
      clearTimeout(t);
      setSlowSync(false);
    };
  }, [syncing]);

  let text: ReactNode = null;
  let tone: "offline" | "failed" | "syncing" = "syncing";
  if (offline) {
    tone = "offline";
    text =
      pendingCount > 0
        ? `Offline — ${plural(pendingCount, "change")} will sync when you're back`
        : "Offline — showing your saved pages";
  } else if (authPaused && pendingCount > 0) {
    tone = "failed";
    text = `Sign in to sync ${plural(pendingCount, "change")}`;
  } else if (failedCount > 0) {
    tone = "failed";
    text = (
      <>
        {plural(failedCount, "change")} couldn&apos;t sync —{" "}
        <button type="button" onClick={onReview} className="font-semibold text-accent-strong hover:underline">
          Review
        </button>
      </>
    );
  } else if (syncing && slowSync && pendingCount > 0) {
    text = `Syncing ${pendingCount}…`;
  }
  if (!text) return null;

  return (
    <div
      role="status"
      data-testid="outbox-banner"
      data-tone={tone}
      className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-[90] flex justify-center px-4"
    >
      <p
        className={
          "rounded-full border bg-surface px-4 py-1.5 text-xs shadow-lg " +
          (tone === "failed" ? "border-warning/60" : "border-border")
        }
      >
        {text}
      </p>
    </div>
  );
}

function ReviewSheet({
  open,
  onClose,
  failed,
  retry,
  discard,
  discardAll,
}: {
  open: boolean;
  onClose: () => void;
  failed: OutboxEntry[];
  retry: (id: string) => void;
  discard: (id: string) => void;
  discardAll: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Changes that couldn't sync">
      <h2 className="mb-1 text-lg font-semibold">Couldn&apos;t sync</h2>
      <p className="mb-4 text-sm text-muted">
        These changes are saved on this device but the server rejected them. Retry, or discard to
        go back to what the server has.
      </p>
      {failed.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
          Nothing left to review.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {failed.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{e.label ?? describeMutation(e.mutation)}</p>
                {e.lastError && <p className="truncate text-xs text-warning">{e.lastError}</p>}
              </div>
              <button
                type="button"
                onClick={() => retry(e.id)}
                className="min-h-11 rounded-md border border-border px-3 text-xs text-muted hover:text-text"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => discard(e.id)}
                className="min-h-11 rounded-md px-3 text-xs text-danger hover:underline"
              >
                Discard
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed.length > 1 && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={discardAll} className="min-h-11 px-2 text-sm text-danger hover:underline">
            Discard all
          </button>
        </div>
      )}
    </Sheet>
  );
}
