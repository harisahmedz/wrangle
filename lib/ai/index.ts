// Public entry point of the client-only AI layer (docs/AI.md). Import this
// from UI code; import a task module only inside the handler that needs it:
//
//   const [{ runTask }, { checklistTask }] = await Promise.all([
//     import("@/lib/ai"), import("@/lib/ai/tasks/checklist"),
//   ]);
//   const r = await runTask(checklistTask, { title, description });
//   if (!r.ok) return heuristicFallback();
//
// `runTask` here is a thin lazy loader: the providers (Nano, OpenRouter, the
// key store, Zod's JSON-schema converter) live behind `import()` so none of
// them reach the shared first-load chunks (ROADMAP-V3 §8). The static
// exports are the tiny mode context and the availability hook.
import type { AiTask, RunOptions, RunResult } from "@/lib/ai/types";

export { useAiAvailable, type AiAvailability } from "@/lib/ai/available";
export { AiModeProvider, useAiMode } from "@/lib/ai/mode";
export {
  AI_MODES,
  type AiMode,
  type AiTask,
  type ProviderName,
  type RunFailReason,
  type RunOptions,
  type RunResult,
} from "@/lib/ai/types";

/**
 * Run one task. Picks the provider from the user's mode (Nano → OpenRouter
 * with the device key → none), validates with the task's Zod schema, allows
 * one repair turn, 8 s per call. Never throws; `{ ok: false, reason }` means
 * "use your heuristic fallback".
 */
export async function runTask<TIn, TOut>(
  task: AiTask<TIn, TOut>,
  input: TIn,
  opts?: RunOptions,
): Promise<RunResult<TOut>> {
  const mod = await import("@/lib/ai/browser");
  return mod.runTask(task, input, opts);
}
