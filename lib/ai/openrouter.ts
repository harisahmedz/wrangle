// OpenRouter with the user's own key, browser → openrouter.ai directly
// (ROADMAP-V3 §4 row 2, §4.1). The key is read from lib/ai/key-store.ts by
// the caller and only ever appears in the Authorization header here.
//
// Each model is one `Candidate`; the runner walks them in order and stops
// after `MAX_OPENROUTER_REQUESTS` requests (lib/ai/run-task.ts).
import { type Candidate, ProviderError } from "@/lib/ai/types";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Default models, best first. The top-ranked entries of
 * `.claude/tools/free-models.json` (rank 2026-11-02) whose
 * `supported_parameters` include `structured_outputs` per
 * GET /api/v1/models the same day: the rank-1 `nemotron-3-ultra-550b` and the
 * 70-point `nemotron-3-nano-omni` lack it, so they are out. Free models
 * rotate: re-check with `node .claude/tools/free-models.mjs list` when a
 * model starts 404-ing, and keep `openrouter/free` last as the catch-all.
 */
export const DEFAULT_MODELS: readonly string[] = [
  "dots-studio/dots-3-note-preview:free", // expires 2026-12-31
  "nvidia/nemotron-3.5-super-vl:free",
  "openrouter/free",
];

export function openRouterCandidates(
  key: string,
  opts: { models?: readonly string[]; fetchFn?: typeof fetch; taskName?: string } = {},
): Candidate[] {
  const fetchFn = opts.fetchFn ?? fetch;
  return (opts.models ?? DEFAULT_MODELS).map((model) => ({
    provider: "openrouter",
    model,
    async complete(messages, schema, signal) {
      const res = await fetchFn(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          max_tokens: 1500,
          // Reasoning models otherwise spend the whole budget thinking (docs/FREE-MODELS.md).
          reasoning: { effort: "low" },
          response_format: {
            type: "json_schema",
            json_schema: { name: opts.taskName ?? "result", strict: true, schema },
          },
        }),
      });
      if (!res.ok) throw new ProviderError(`OpenRouter ${res.status}`, res.status);
      const body = (await res.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      } | null;
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new ProviderError("OpenRouter: empty reply");
      return content;
    },
  }));
}
