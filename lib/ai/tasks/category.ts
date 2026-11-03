// Expense category suggestion (V3 S3). Only the note and the category names
// ever reach the model: no amounts, dates or history (ROADMAP-V3 §5).
import { z } from "zod";
import type { AiTask } from "@/lib/ai/types";

export const MAX_NOTE_CHARS = 120;
export const MAX_CATEGORIES = 20;

export type CategoryInput = { note: string; names: string[] };
export type CategoryOutput = { category: number | null };

export const categoryTask: AiTask<CategoryInput, CategoryOutput> = {
  name: "expense_category",
  schema: z.object({ category: z.number().int().min(1).max(MAX_CATEGORIES).nullable() }),
  inputBudget: 1000,
  prompt: ({ note, names }) => ({
    system: [
      "You pick the spending category that best fits an expense note.",
      "STEP 1. Read the note.",
      "STEP 2. Read the numbered categories.",
      "STEP 3. Pick the one category that fits. If none clearly fits, pick null.",
      'STEP 4. Reply with ONLY this JSON: {"category": <number of that category or null>}',
      "Never add prose. Never invent a category. Never pick more than one.",
    ].join("\n"),
    user: `Note: ${note.trim().slice(0, MAX_NOTE_CHARS)}\n\nCategories:\n${names
      .slice(0, MAX_CATEGORIES)
      .map((n, i) => `${i + 1}. ${n.slice(0, 30)}`)
      .join("\n")}`,
  }),
  examples: [
    { user: "Note: uber to airport\n\nCategories:\n1. Food\n2. Transport\n3. Bills", output: { category: 2 } },
    { user: "Note: asdf\n\nCategories:\n1. Food\n2. Transport\n3. Bills", output: { category: null } },
    { user: "Note: netflix\n\nCategories:\n1. Groceries\n2. Rent\n3. Fun\n4. Health", output: { category: 3 } },
  ],
};

/** Meaning check on the model's answer: index in range, else no suggestion. */
export function pickCategoryId(answer: CategoryOutput, ids: string[]): string | null {
  const n = answer.category;
  if (n === null || n < 1 || n > Math.min(ids.length, MAX_CATEGORIES)) return null;
  return ids[n - 1] ?? null;
}
