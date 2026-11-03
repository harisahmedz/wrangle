// A1 Dump v2 (ROADMAP-V3 §5): the lines the heuristic parser couldn't place go
// to the model in ONE call. The model picks a bucket and a short title per
// numbered line; dates and amounts always stay with the heuristic. Code
// re-checks the answer (`resolveDumpItems`) before the tray uses it.
import { z } from "zod";
import type { AiTask } from "@/lib/ai/types";

export const DUMP_SORT_MAX_LINES = 20;
export const DUMP_SORT_LINE_CHARS = 200;
export const DUMP_SORT_MAX_PROJECTS = 20;
const PROJECT_NAME_CHARS = 40;

export const DUMP_KINDS = ["task", "idea", "expense", "learning"] as const;
export type DumpSortKind = (typeof DUMP_KINDS)[number];

export type DumpSortInput = { lines: string[]; projects?: string[] };

const itemSchema = z.object({
  line: z.number().int().min(1).max(DUMP_SORT_MAX_LINES),
  kind: z.enum(DUMP_KINDS),
  title: z.string().min(1).max(80),
  project: z.number().int().min(1).max(DUMP_SORT_MAX_PROJECTS).nullable(),
});

export const dumpSortSchema = z.object({
  items: z.array(itemSchema).max(DUMP_SORT_MAX_LINES),
});
export type DumpSortOutput = z.infer<typeof dumpSortSchema>;
export type DumpSortItem = z.infer<typeof itemSchema>;

function oneLine(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

/** The numbered facts for this call. Capped here, so a long Dump never trips the budget. */
export function buildDumpSortUser({ lines, projects = [] }: DumpSortInput): string {
  const ls = lines
    .slice(0, DUMP_SORT_MAX_LINES)
    .map((l) => oneLine(l, DUMP_SORT_LINE_CHARS))
    .map((l, i) => `${i + 1}. ${l}`);
  const ps = projects
    .map((p) => oneLine(p, PROJECT_NAME_CHARS))
    .filter(Boolean)
    .slice(0, DUMP_SORT_MAX_PROJECTS)
    .map((p, i) => `${i + 1}. ${p}`);
  return ["LINES", ...ls, "PROJECTS", ...(ps.length ? ps : ["(none)"])].join("\n");
}

export const dumpSortTask: AiTask<DumpSortInput, DumpSortOutput> = {
  name: "dump_sort",
  schema: dumpSortSchema,
  // 20 lines x (200 + "NN. ") + 20 projects x (40 + "NN. ") + headings
  inputBudget: 5200,
  prompt: (input) => ({
    system: [
      "You sort short notes into buckets for a personal organiser.",
      "STEP 1. Read the numbered LINES. Each line is one note.",
      "STEP 2. For each line pick kind: task (something to do), idea (something to think about or build later), expense (money spent), learning (something studied or practised).",
      "STEP 3. Write a title of at most 80 characters from the line's own words. Do not add facts.",
      "STEP 4. If a PROJECTS list is given and one project clearly fits, set project to its number. Otherwise null.",
      'STEP 5. Reply with ONLY this JSON: {"items": [{"line": <line number>, "kind": "task", "title": "<title>", "project": null}]}',
      "Never write dates, times or money amounts. Never invent a line number. Never add prose. One item per line, at most.",
    ].join("\n"),
    user: buildDumpSortUser(input),
  }),
  examples: [
    {
      user: buildDumpSortUser({
        lines: ["dark mode for the blog", "pizza with Sam", "reading about rust lifetimes"],
        projects: ["Blog", "Home"],
      }),
      output: {
        items: [
          { line: 1, kind: "idea", title: "Dark mode for the blog", project: 1 },
          { line: 2, kind: "expense", title: "Pizza with Sam", project: null },
          { line: 3, kind: "learning", title: "Rust lifetimes", project: null },
        ],
      },
    },
    {
      user: buildDumpSortUser({ lines: ["renew passport", "what if the app had themes"] }),
      output: {
        items: [
          { line: 1, kind: "task", title: "Renew passport", project: null },
          { line: 2, kind: "idea", title: "App themes", project: null },
        ],
      },
    },
  ],
};

/**
 * Code checks the meaning (Zod already checked the shape): keep the first
 * answer per line, drop line numbers outside 1..lineCount (invented), blank
 * titles, and project numbers outside 1..projectCount (becomes null).
 * Returns a map keyed by 0-based line index.
 */
export function resolveDumpItems(
  items: DumpSortItem[],
  lineCount: number,
  projectCount = 0,
): Map<number, { kind: DumpSortKind; title: string; project: number | null }> {
  const out = new Map<number, { kind: DumpSortKind; title: string; project: number | null }>();
  for (const it of items) {
    const idx = it.line - 1;
    if (idx < 0 || idx >= lineCount || out.has(idx)) continue;
    const title = oneLine(it.title, 80);
    if (!title) continue;
    const project = it.project != null && it.project <= projectCount ? it.project : null;
    out.set(idx, { kind: it.kind, title, project });
  }
  return out;
}
