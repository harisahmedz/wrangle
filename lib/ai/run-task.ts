// The pure runner (docs/AI.md): mode/online/budget gates → walk the ordered
// candidates → validate with Zod → one repair turn per run → `{ ok: false,
// reason }` so the caller uses its heuristic fallback. No browser globals
// here; `lib/ai/browser.ts` composes the candidates.
import { z } from "zod";
import {
  type AiMode,
  type AiTask,
  type Candidate,
  type ChatMessage,
  type JsonSchema,
  ProviderError,
  type RunFailReason,
  type RunOptions,
  type RunResult,
} from "@/lib/ai/types";

/** Per-request timeout for on-device Nano. */
export const AI_TIMEOUT_MS = 8_000;

/** Per-request timeout for OpenRouter: free models measured 7–20 s per reply (V3 S1/S6 live checks). */
export const OPENROUTER_TIMEOUT_MS = 25_000;

/** Hard cap on requests to OpenRouter per `runTask`, across models and the repair turn (it is the user's own daily quota). */
export const MAX_OPENROUTER_REQUESTS = 3;

export const REPAIR_PROMPT =
  "That reply was not valid. Reply again with ONLY the JSON object, no prose, no code fences. Problems: ";

export interface RunDeps {
  mode: AiMode;
  online: boolean;
  /** Ordered: Nano first (if usable), then OpenRouter models. Empty → "no-provider". */
  candidates: Candidate[];
  timeoutMs?: number;
  maxOpenRouterRequests?: number;
}

/** Zod → JSON Schema for `responseConstraint` / `response_format`. `$schema` dropped (strict validators reject unknown keys). */
export function toJsonSchema(schema: z.ZodType): JsonSchema {
  const { $schema: _omit, ...rest } = z.toJSONSchema(schema) as JsonSchema & { $schema?: string };
  void _omit;
  return rest;
}

/** System card, worked examples as prior turns, then this call's facts. */
export function buildMessages<TIn, TOut>(
  task: AiTask<TIn, TOut>,
  built: { system: string; user: string },
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: built.system }];
  for (const ex of task.examples ?? []) {
    messages.push({ role: "user", content: ex.user });
    messages.push({ role: "assistant", content: JSON.stringify(ex.output) });
  }
  messages.push({ role: "user", content: built.user });
  return messages;
}

/**
 * Tolerant extraction: strips ``` fences and any prose around the outermost
 * `{…}` (weak models often get the content right and the wrapping wrong),
 * then Zod decides.
 */
export function parseReply<TOut>(
  raw: string,
  schema: z.ZodType<TOut>,
): { ok: true; data: TOut } | { ok: false; issues: string } {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, issues: "no JSON object found" };
  text = text.slice(start, end + 1);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, issues: "not valid JSON" };
  }
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 4)
    .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
    .join("; ");
  return { ok: false, issues };
}

type Attempt =
  | { raw: string }
  | { fail: RunFailReason; detail?: string; stop?: boolean };

/** One request with the 8 s timeout and the caller's signal. Never throws. */
async function attempt(
  c: Candidate,
  messages: ChatMessage[],
  schema: JsonSchema,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Attempt> {
  if (callerSignal?.aborted) return { fail: "aborted", stop: true };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const onCallerAbort = () => ctl.abort();
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  // Race against the signal too: a candidate that ignores `signal` must still time out.
  const aborted = new Promise<never>((_, reject) => {
    ctl.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  try {
    const raw = await Promise.race([c.complete(messages, schema, ctl.signal), aborted]);
    return { raw };
  } catch (e) {
    if (callerSignal?.aborted) return { fail: "aborted", stop: true };
    if (ctl.signal.aborted) return { fail: "timeout" };
    if (e instanceof ProviderError && e.status !== undefined && [401, 402, 403].includes(e.status)) {
      return { fail: "auth", detail: e.message, stop: true };
    }
    return { fail: "error", detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

/**
 * Walks the candidates in order. A 429/404/5xx/network error or a timeout
 * moves to the next one. An invalid reply gets the run's single repair turn
 * (ROADMAP-V3 §3.1) on the same candidate; a second invalid reply moves on.
 * OpenRouter requests are capped at `MAX_OPENROUTER_REQUESTS` in total.
 */
export async function runTaskWith<TIn, TOut>(
  task: AiTask<TIn, TOut>,
  input: TIn,
  deps: RunDeps,
  opts: RunOptions = {},
): Promise<RunResult<TOut>> {
  const fail = (reason: RunFailReason, detail?: string): RunResult<TOut> => ({ ok: false, reason, detail });
  if (deps.mode === "off") return fail("off");
  if (!deps.online) return fail("offline");

  let built: { system: string; user: string };
  try {
    built = task.prompt(input);
  } catch (e) {
    return fail("error", e instanceof Error ? e.message : "prompt builder threw");
  }
  if (built.user.length > task.inputBudget) {
    return fail("budget", `${built.user.length} chars > ${task.inputBudget}`);
  }
  if (deps.candidates.length === 0) return fail("no-provider");

  const schema = toJsonSchema(task.schema);
  const base = buildMessages(task, built);
  const maxOr = deps.maxOpenRouterRequests ?? MAX_OPENROUTER_REQUESTS;
  let orRequests = 0;
  let repaired = false;
  let last: RunFailReason = "error";
  let detail: string | undefined;

  for (const c of deps.candidates) {
    const isOr = c.provider === "openrouter";
    const timeoutMs = deps.timeoutMs ?? (isOr ? OPENROUTER_TIMEOUT_MS : AI_TIMEOUT_MS);
    if (isOr && orRequests >= maxOr) break;
    const started = Date.now();
    let messages = base;

    for (let turn = 0; turn < 2; turn++) {
      const r = await attempt(c, messages, schema, opts.signal, timeoutMs);
      if (isOr) orRequests++;
      if ("fail" in r) {
        if (r.stop) return fail(r.fail, r.detail);
        last = r.fail;
        detail = r.detail;
        break; // next candidate
      }
      const parsed = parseReply(r.raw, task.schema);
      if (parsed.ok) {
        return { ok: true, data: parsed.data, provider: c.provider, model: c.model, ms: Date.now() - started };
      }
      last = "invalid";
      detail = parsed.issues;
      if (repaired || (isOr && orRequests >= maxOr)) break;
      repaired = true;
      messages = [
        ...base,
        { role: "assistant", content: r.raw },
        { role: "user", content: REPAIR_PROMPT + parsed.issues },
      ];
    }
  }
  return fail(last, detail);
}
