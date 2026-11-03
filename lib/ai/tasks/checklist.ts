// "Split into checklist" (V3 S2, backlog B89): turn a card's title and
// description into 3-7 short steps. The model only writes the step texts;
// `cleanChecklistItems` then drops duplicates of existing items and the title.
import { z } from "zod";
import type { AiTask } from "@/lib/ai/types";

export const CHECKLIST_INPUT_MAX = 1500;
export const CHECKLIST_ITEM_MAX = 60;

export type ChecklistTaskInput = { title: string; description: string };

export const checklistTask: AiTask<ChecklistTaskInput, { items: string[] }> = {
  name: "checklist",
  schema: z.object({
    items: z.array(z.string().trim().min(1).max(CHECKLIST_ITEM_MAX)).min(3).max(7),
  }),
  inputBudget: CHECKLIST_INPUT_MAX,
  prompt: ({ title, description }) => {
    const head = `TITLE: ${title.trim().slice(0, 200)}\nDESCRIPTION: `;
    const body = description.trim().slice(0, Math.max(0, CHECKLIST_INPUT_MAX - head.length));
    return {
      system: [
        "You break one task into a short checklist of concrete steps.",
        "STEP 1. Read the TITLE and DESCRIPTION.",
        "STEP 2. Write 3 to 7 steps, in the order they would be done.",
        "STEP 3. Start each step with a verb. Keep each step under 60 characters.",
        'STEP 4. Reply with ONLY this JSON: {"items": ["step", "step", "step"]}',
        "Never add prose, numbering or a step that repeats the TITLE. Never write more than 7 steps.",
      ].join("\n"),
      user: head + body,
    };
  },
  examples: [
    {
      user: "TITLE: Plan team offsite\nDESCRIPTION: Two days in March, about 12 people, needs a venue and food.",
      output: {
        items: ["Pick the dates", "Shortlist three venues", "Book the venue", "Arrange food and drinks", "Send the agenda to the team"],
      },
    },
    {
      user: "TITLE: Fix login bug\nDESCRIPTION: Users on Safari get logged out after a minute.",
      output: {
        items: ["Reproduce it in Safari", "Check the session cookie settings", "Write a failing test", "Ship the fix"],
      },
    },
  ],
};

/** Meaning check after the schema: trim, drop empties, duplicates, the title and existing items (case-insensitive). */
export function cleanChecklistItems(items: string[], existing: string[], title: string): string[] {
  const seen = new Set([title, ...existing].map((s) => s.trim().toLowerCase()));
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.trim();
    const key = t.toLowerCase();
    if (!t || t.length > CHECKLIST_ITEM_MAX || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
