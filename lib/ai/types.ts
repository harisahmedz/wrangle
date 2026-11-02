// Shared types for the client-only AI layer (docs/AI.md, ROADMAP-V3 §3–4).
// Runtime-light on purpose: this file is imported by the settings panel, the
// prefs schema and the availability hook, so it must not pull in a provider.
import type { z } from "zod";

export const AI_MODES = ["off", "on-device", "on-device-then-openrouter"] as const;
export type AiMode = (typeof AI_MODES)[number];

export type ProviderName = "nano" | "openrouter";

/** Fired on `window` when this device's providers change (key saved/removed, Nano downloaded), so hooks re-probe. */
export const AI_CHANGED_EVENT = "wrangle-ai-changed";

/**
 * A task module (`lib/ai/tasks/<name>.ts`). One narrow choice per call; the
 * code around it works out the facts and checks the answer (ROADMAP-V3 §3).
 */
export interface AiTask<TIn, TOut> {
  /** Short id, used in the OpenRouter `json_schema.name` and in results. */
  name: string;
  /**
   * Output shape. Every reply is validated with it; the JSON schema sent to
   * the model is derived from it. Use `.nullable()` rather than `.optional()`:
   * strict JSON-schema mode needs every property listed in `required`.
   */
  schema: z.ZodType<TOut>;
  /** Hard cap on `prompt(input).user.length`; over budget → `{ ok: false, reason: "budget" }`. */
  inputBudget: number;
  /** The task card (`system`) and the numbered facts for this call (`user`). */
  prompt(input: TIn): { system: string; user: string };
  /** Worked examples, sent as prior user/assistant turns. 2 is the sweet spot for weak models. */
  examples?: Array<{ user: string; output: TOut }>;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type JsonSchema = Record<string, unknown>;

export type RunFailReason =
  | "off" // mode is "off"
  | "offline" // navigator.onLine === false
  | "no-provider" // nothing usable: no Nano, no key (or mode excludes OpenRouter)
  | "budget" // task input over its char budget
  | "timeout" // the last attempt timed out (8 s each)
  | "invalid" // no reply matched the schema, even after the one repair turn
  | "auth" // OpenRouter rejected the key (401/402/403): chain stops, settings should show it
  | "aborted" // caller's signal fired
  | "error"; // network / provider errors (429, 404, 5xx, …) on the last attempt

export type RunResult<TOut> =
  | { ok: true; data: TOut; provider: ProviderName; model?: string; ms: number }
  | { ok: false; reason: RunFailReason; detail?: string };

export interface RunOptions {
  /** Caller-side cancel (e.g. the sheet closed). Independent of the per-call 8 s timeout. */
  signal?: AbortSignal;
  /** Defaults to the mode `AiModeProvider` holds. Tests pass it explicitly. */
  mode?: AiMode;
}

/**
 * One thing that can answer: Nano, or one OpenRouter model. `complete` gets
 * the full transcript (so a repair turn is just "the same list plus two
 * messages") and the JSON schema to constrain output, and returns raw text.
 * It throws `ProviderError` for HTTP failures so the runner can decide
 * whether to move on or stop.
 */
export interface Candidate {
  provider: ProviderName;
  model?: string;
  complete(messages: ChatMessage[], schema: JsonSchema, signal: AbortSignal): Promise<string>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    /** HTTP status when known (OpenRouter); undefined for Nano/network errors. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
