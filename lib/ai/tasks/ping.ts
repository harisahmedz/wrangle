// The built-in test task behind Settings → AI → "Test". Also the template a
// new task module copies (docs/AI.md): one narrow choice, numbered facts,
// closed output, two worked examples, a "never" line.
import { z } from "zod";
import type { AiTask } from "@/lib/ai/types";

export const pingTask: AiTask<{ words: string[] }, { pick: number }> = {
  name: "ping",
  schema: z.object({ pick: z.number().int().min(1).max(10) }),
  inputBudget: 200,
  prompt: ({ words }) => ({
    system: [
      "You pick the one word that names a colour.",
      "STEP 1. Read the numbered words.",
      "STEP 2. Find the word that is a colour.",
      'STEP 3. Reply with ONLY this JSON: {"pick": <number of that word>}',
      "Never add prose. Never pick more than one.",
    ].join("\n"),
    user: words.map((w, i) => `${i + 1}. ${w}`).join("\n"),
  }),
  examples: [
    { user: "1. table\n2. green\n3. run", output: { pick: 2 } },
    { user: "1. red\n2. seven\n3. door", output: { pick: 1 } },
  ],
};

/** Fixed input + expected answer so the Settings button can say "worked" rather than "replied". */
export const PING_INPUT = { words: ["apple", "car", "blue", "seven"] };
export const PING_ANSWER = 3;
