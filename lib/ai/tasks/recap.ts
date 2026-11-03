// One calm sentence under the Weekly review and Life Wrapped (backlog B91).
// Code builds the facts (lib/review/recap-facts.ts); the model only phrases
// them; `checkRecapLine` then rejects anything that adds a number, runs long,
// or isn't one sentence. A rejected line means the page stays as it is today.
import { z } from "zod";
import type { AiTask } from "@/lib/ai/types";

export type RecapInput = { period: "week" | "month"; facts: string[] };
export type RecapOutput = { line: string };

export const RECAP_MAX_CHARS = 140;
export const RECAP_MAX_FACTS = 8;

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** Every number in `text`, normalised ("1,320.50" -> "1320.5", "08" -> "8"). */
export function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map((n) => String(Number(n.replace(/,/g, ""))));
}

/** Short stable id for a facts list, for the sessionStorage cache key. */
export function hashFacts(facts: string[]): string {
  let h = 5381;
  for (const ch of facts.join("\n")) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return h.toString(36);
}

/**
 * The meaning check that runs after Zod: returns the trimmed line, or null if
 * it must not be shown. Rules: <= 140 chars, one sentence, second person, no
 * emoji or "!", and no number (digits, currency, "2h") that isn't in the facts.
 */
export function checkRecapLine(line: string, facts: string[]): string | null {
  const text = line.trim();
  if (text.length === 0 || text.length > RECAP_MAX_CHARS) return null;
  if (text.includes("!") || /\p{Extended_Pictographic}/u.test(text)) return null;
  if (/[\r\n]/.test(text)) return null;
  if (!/\b(you|your|you're|you've)\b/i.test(text)) return null;
  // Sentence ends: ". ? …" followed by space/end. Decimal points ("$132.40") don't count.
  const ends = [...text.matchAll(/[.?…]+(?=\s|$)/g)];
  if (ends.length > 1) return null;
  if (ends.length === 1 && ends[0].index! + ends[0][0].length < text.length) return null;
  const allowed = new Set(facts.flatMap(numbersIn));
  if (!numbersIn(text).every((n) => allowed.has(n))) return null;
  return text;
}

export const recapTask: AiTask<RecapInput, RecapOutput> = {
  name: "recap",
  schema: z.object({ line: z.string().min(1).max(RECAP_MAX_CHARS) }),
  inputBudget: 900,
  prompt: ({ period, facts }) => ({
    system: [
      "You write one calm sentence that sums up a person's week or month.",
      "STEP 1. Read the numbered facts. They are the only truth.",
      "STEP 2. Pick the two or three facts that matter most.",
      "STEP 3. Write ONE sentence of 140 characters or fewer, speaking to the person as you.",
      'STEP 4. Reply with ONLY this JSON: {"line": "<the sentence>"}',
      "Copy every number exactly as it is written in the facts.",
      "Never use a number that is not in the facts. Never use an exclamation mark, an emoji or a second sentence.",
    ].join("\n"),
    user: [`Period: ${period}`, ...facts.slice(0, RECAP_MAX_FACTS).map((f, i) => `${i + 1}. ${f}`)].join("\n"),
  }),
  examples: [
    {
      user: "Period: week\n1. cards closed: 8\n2. top project: Side project\n3. learning: 2h 15m\n4. slipped: 4",
      output: { line: "You closed 8 cards, mostly in Side project, and studied for 2h 15m." },
    },
    {
      user: "Period: month\n1. cards closed: 31\n2. spent: $132.40\n3. ideas captured: 6",
      output: { line: "You closed 31 cards this month and kept spending to $132.40." },
    },
  ],
};
