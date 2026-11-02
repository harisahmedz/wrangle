// Browser composition of the runner: which candidates exist on this device
// right now. Loaded only via `import()` from lib/ai/index.ts,
// lib/ai/available.ts and the settings panel, so none of it (nor Zod's
// JSON-schema converter) is in the shared first-load chunks.
import { keyStore, type StoredKey } from "@/lib/ai/key-store";
import { getAiMode } from "@/lib/ai/mode";
import { getNanoModel, type NanoAvailability, nanoAvailability, nanoCandidate } from "@/lib/ai/nano";
import { openRouterCandidates } from "@/lib/ai/openrouter";
import { runTaskWith } from "@/lib/ai/run-task";
import type { AiMode, AiTask, Candidate, ProviderName, RunOptions, RunResult } from "@/lib/ai/types";

/** Node has a `navigator` without `onLine`; only an explicit `false` means offline. */
const isOnline = () => globalThis.navigator?.onLine !== false;

/** Ordered providers for `mode` on this device. Exported for tests. */
export async function candidatesFor(mode: AiMode, taskName?: string): Promise<Candidate[]> {
  if (mode === "off") return [];
  const out: Candidate[] = [];
  const nano = getNanoModel();
  // "downloadable"/"downloading" don't count: we never trigger a multi-GB download from a task.
  if (nano && (await nanoAvailability(nano)) === "available") out.push(nanoCandidate(nano));
  if (mode === "on-device-then-openrouter") {
    const stored = await keyStore()
      .get()
      .catch(() => null);
    if (stored) out.push(...openRouterCandidates(stored.key, { taskName }));
  }
  return out;
}

/** What `useAiAvailable` shows: the first provider that would answer right now. */
export async function probeProvider(mode: AiMode): Promise<ProviderName | null> {
  const [first] = await candidatesFor(mode);
  return first?.provider ?? null;
}

export interface AiStatus {
  nano: NanoAvailability;
  /** The stored key's metadata, never the key itself. */
  key: Omit<StoredKey, "key"> | null;
}

/** What the settings panel shows. */
export async function aiStatus(): Promise<AiStatus> {
  const [nano, stored] = await Promise.all([nanoAvailability(), keyStore().get().catch(() => null)]);
  return { nano, key: stored ? { source: stored.source, connectedAt: stored.connectedAt } : null };
}

/** The real `runTask`. Never throws. */
export async function runTask<TIn, TOut>(
  task: AiTask<TIn, TOut>,
  input: TIn,
  opts: RunOptions = {},
): Promise<RunResult<TOut>> {
  try {
    const mode = opts.mode ?? getAiMode();
    const online = isOnline();
    const candidates = mode === "off" || !online ? [] : await candidatesFor(mode, task.name);
    return await runTaskWith(task, input, { mode, online, candidates }, opts);
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}
