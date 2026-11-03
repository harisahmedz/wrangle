// Plan my week's optional AI step (V3 S6, backlog B93, ROADMAP-V3 A6): the
// user's focus sentence plus the numbered candidate titles → the numbers of
// the cards that serve that focus. The model never sees or picks dates; the
// scheduler (lib/plan/schedule.ts) does every date and only treats the picks
// as `pinned`. `cleanPicks` is the meaning check after the schema.
import { z } from "zod";
import type { AiTask } from "@/lib/ai/types";

export const PLAN_FOCUS_MAX = 200;
export const PLAN_TITLE_MAX = 80;
export const PLAN_TITLES_MAX = 40;
export const PLAN_PICKS_MAX = 15;

export type PlanFocusInput = { focus: string; titles: string[] };

export const planFocusTask: AiTask<PlanFocusInput, { pick: number[] }> = {
  name: "plan_focus",
  schema: z.object({
    pick: z.array(z.number().int().min(1).max(PLAN_TITLES_MAX)).max(PLAN_PICKS_MAX),
  }),
  // "FOCUS: " + 200 chars, then 40 lines of "40. " + 80 chars ≈ 3,600.
  inputBudget: 4000,
  prompt: ({ focus, titles }) => ({
    system: [
      "You pick which tasks match what the user wants to focus on this week.",
      "STEP 1. Read the FOCUS line.",
      "STEP 2. Read the numbered tasks.",
      "STEP 3. Pick only the tasks that clearly serve that focus. Picking none is a valid answer.",
      'STEP 4. Reply with ONLY this JSON: {"pick": [<task numbers>]}',
      "Never pick more than 15. Never use a number that is not in the list. Never add prose.",
    ].join("\n"),
    user: [
      `FOCUS: ${focus.trim().slice(0, PLAN_FOCUS_MAX)}`,
      ...titles
        .slice(0, PLAN_TITLES_MAX)
        .map((t, i) => `${i + 1}. ${t.trim().slice(0, PLAN_TITLE_MAX)}`),
    ].join("\n"),
  }),
  examples: [
    {
      user: [
        "FOCUS: this week I want to get the flat in order",
        "1. Renew car insurance",
        "2. Sort out the garage",
        "3. Write landing page copy",
        "4. Fix the kitchen tap",
      ].join("\n"),
      output: { pick: [2, 4] },
    },
    {
      user: [
        "FOCUS: ship the side project",
        "1. Book dentist appointment",
        "2. Set up analytics",
        "3. Design onboarding flow",
        "4. Buy bread",
      ].join("\n"),
      output: { pick: [2, 3] },
    },
  ],
};

/**
 * Meaning check after the schema: keeps 1-based numbers within `count`
 * (the titles actually sent), drops duplicates and anything past the 15th.
 * Order is the model's; the scheduler re-ranks pinned cards anyway.
 */
export function cleanPicks(pick: readonly number[], count: number): number[] {
  const out: number[] = [];
  for (const n of pick) {
    if (!Number.isInteger(n) || n < 1 || n > count || out.includes(n)) continue;
    out.push(n);
    if (out.length === PLAN_PICKS_MAX) break;
  }
  return out;
}
