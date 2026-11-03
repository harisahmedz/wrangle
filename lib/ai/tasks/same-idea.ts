// A5 duplicate idea check (V3 S5): the new idea's title plus up to 50 numbered
// existing idea titles in, `{ same: number[] }` out (0-3 list numbers).
// Code checks the numbers again with `pickSame`.
import { z } from "zod";
import type { AiTask } from "@/lib/ai/types";
import type { IdeaRef } from "@/lib/kanban/duplicate-idea";

export const MAX_TITLES = 50;
export const MAX_TITLE_CHARS = 80;

export type SameIdeaInput = { title: string; existing: string[] };

export const sameIdeaTask: AiTask<SameIdeaInput, { same: number[] }> = {
  name: "same_idea",
  schema: z.object({ same: z.array(z.number().int()).max(3) }),
  inputBudget: 4800,
  prompt: ({ title, existing }) => ({
    system: [
      "You find ideas that mean the same thing as a new idea.",
      "STEP 1. Read the NEW idea.",
      "STEP 2. Read the numbered EXISTING ideas.",
      "STEP 3. List the numbers of existing ideas that are about the same thing as the new one. Different wording is fine. A related but different idea is not the same.",
      'STEP 4. Reply with ONLY this JSON: {"same": [<numbers>]}',
      'Use {"same": []} when none match. Never list more than 3 numbers. Never add prose. Never invent a number.',
    ].join("\n"),
    user: `NEW: ${title}\nEXISTING:\n${existing.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
  }),
  examples: [
    {
      user: "NEW: Self-host a photo server\nEXISTING:\n1. Learn to bake sourdough\n2. Home server for photos\n3. Plan a trip to Japan",
      output: { same: [2] },
    },
    {
      user: "NEW: Podcast about woodworking\nEXISTING:\n1. Build a standing desk\n2. Start a newsletter\n3. Garden shed",
      output: { same: [] },
    },
  ],
};

/** The capped input for a call: at most 50 titles, each at most 80 characters. */
export function buildSameInput(title: string, ideas: IdeaRef[]): { input: SameIdeaInput; refs: IdeaRef[] } {
  const refs = ideas.slice(0, MAX_TITLES);
  return {
    input: { title: title.slice(0, MAX_TITLE_CHARS), existing: refs.map((i) => i.title.slice(0, MAX_TITLE_CHARS)) },
    refs,
  };
}

/** Meaning check: the first number that points at a real, listed idea (out of range / repeats ignored). */
export function pickSame(same: number[], refs: IdeaRef[]): IdeaRef | null {
  for (const n of same) {
    const ref = Number.isInteger(n) ? refs[n - 1] : undefined;
    if (ref) return ref;
  }
  return null;
}
