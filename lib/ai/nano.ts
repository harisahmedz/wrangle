// Gemini Nano via Chrome's Prompt API (`LanguageModel` global), ROADMAP-V3 §4
// row 1. Shape per https://developer.chrome.com/docs/ai/prompt-api (read
// 2026-11-02): `availability()` → "unavailable" | "downloadable" |
// "downloading" | "available"; `create({ initialPrompts, signal, monitor,
// expectedInputs, expectedOutputs })`; `session.prompt(text,
// { responseConstraint, signal })`; `session.destroy()`. Desktop Chrome/Edge
// only, never Android or iOS.
//
// The model object is injected (`nanoCandidate(model)`) so tests pass a mock;
// `getNanoModel()` is the browser lookup.
import type { Candidate, ChatMessage, JsonSchema } from "@/lib/ai/types";

export type NanoAvailability = "unavailable" | "downloadable" | "downloading" | "available";

export interface NanoSession {
  prompt(
    input: string,
    opts?: { responseConstraint?: JsonSchema; omitResponseConstraintInput?: boolean; signal?: AbortSignal },
  ): Promise<string>;
  destroy(): void;
}

export interface NanoCreateOptions {
  initialPrompts?: ChatMessage[];
  signal?: AbortSignal;
  monitor?(m: EventTarget): void;
  expectedInputs?: Array<{ type: "text"; languages?: string[] }>;
  expectedOutputs?: Array<{ type: "text"; languages?: string[] }>;
}

export interface NanoModel {
  availability(): Promise<NanoAvailability>;
  create(opts?: NanoCreateOptions): Promise<NanoSession>;
}

export function getNanoModel(): NanoModel | null {
  const g = globalThis as { LanguageModel?: NanoModel };
  return typeof g.LanguageModel?.availability === "function" ? g.LanguageModel : null;
}

/** Never throws: an unsupported browser reads as "unavailable". */
export async function nanoAvailability(model: NanoModel | null = getNanoModel()): Promise<NanoAvailability> {
  if (!model) return "unavailable";
  try {
    return await model.availability();
  } catch {
    return "unavailable";
  }
}

const ENGLISH = [{ type: "text" as const, languages: ["en"] }];

/**
 * One Nano answer. Every message but the last seeds the session
 * (`initialPrompts`, roles system/user/assistant), the last is the prompt.
 * A repair turn therefore re-creates the session with the reply appended:
 * two short-lived sessions, one uniform `Candidate` contract.
 */
export function nanoCandidate(model: NanoModel): Candidate {
  return {
    provider: "nano",
    async complete(messages, schema, signal) {
      const last = messages[messages.length - 1];
      const session = await model.create({
        initialPrompts: messages.slice(0, -1),
        signal,
        expectedInputs: ENGLISH,
        expectedOutputs: ENGLISH,
      });
      try {
        return await session.prompt(last.content, { responseConstraint: schema, signal });
      } finally {
        session.destroy();
      }
    },
  };
}

/**
 * Settings' "Download" for the "downloadable" state: creating a session
 * starts Chrome's one-time model download; `onProgress` gets 0..1.
 */
export async function downloadNano(model: NanoModel, onProgress: (fraction: number) => void): Promise<void> {
  const session = await model.create({
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        const { loaded, total } = e as Event & { loaded?: number; total?: number };
        if (typeof loaded !== "number") return;
        // Current Chrome reports `loaded` as 0..1; older builds reported bytes with `total`.
        onProgress(total && total > 1 ? loaded / total : loaded);
      });
    },
    expectedInputs: ENGLISH,
    expectedOutputs: ENGLISH,
  });
  session.destroy();
}
