import { parseTask } from "@/lib/dump/parser";
import { formatDueLabel } from "@/components/tasks/due-label";

export type QuickAddProjectOption = {
  id: string;
  name: string;
  isPersonal: boolean;
};

export type QuickAddParse = {
  /** Title with both the date phrase and a matched "#project" token
   * removed — what actually gets submitted as the card title. */
  cleanTitle: string;
  /** Title with only the date phrase removed, "#project" left intact —
   * what the date chip's × sets the input back to. */
  dateStrippedTitle: string;
  dueAt: Date | null;
  isAllDay: boolean;
  /** "Tomorrow 17:00"-style label for the date chip, or null. */
  dueLabel: string | null;
  /** The matched project, or null if no "#token" was typed or it matched
   * nothing. */
  project: QuickAddProjectOption | null;
  /** The raw token text after "#" (e.g. "Side"), or null if none was typed. */
  projectToken: string | null;
  /** True when a "#token" was typed but matched no project. */
  projectUnknown: boolean;
  /** "p1".."p4" as typed (V2 S9/B85) — 4 means "no priority", same as
   * null; both display with a neutral chip and normalize to null on
   * submit (lib/kanban/priority.ts). Null when no token was typed. */
  priority: 1 | 2 | 3 | 4 | null;
  /** Title with only the priority phrase removed, date/"#project" text
   * left intact — what the priority chip's × sets the input back to. */
  priorityStrippedTitle: string;
};

const PROJECT_TOKEN_RE = /#([^\s#]+)/;
// Only a standalone "p1".."p4" word: start-of-string or preceded by
// whitespace, followed by whitespace or end-of-string. A plain `\b` word
// boundary (the original implementation) also matches right after `#` or
// `/` — both non-word characters — so it false-matched inside a
// "#p2-backlog" project token or a "/p1/settings" URL. Lookbehind/lookahead
// keep the match itself to just "pN" (no leading/trailing whitespace
// consumed), same as before.
const PRIORITY_TOKEN_RE = /(?<=^|\s)p([1-4])(?=\s|$)/i;

function findPriorityMatch(
  text: string,
): { priority: 1 | 2 | 3 | 4; index: number; length: number } | null {
  const m = PRIORITY_TOKEN_RE.exec(text);
  if (!m) return null;
  return { priority: Number(m[1]) as 1 | 2 | 3 | 4, index: m.index, length: m[0].length };
}

function stripToken(text: string, index: number, length: number): string {
  const cut = `${text.slice(0, index)} ${text.slice(index + length)}`;
  const tidy = cut.replace(/\s{2,}/g, " ").trim();
  return tidy ? tidy.charAt(0).toUpperCase() + tidy.slice(1) : tidy;
}

function matchProject(
  token: string,
  projects: QuickAddProjectOption[],
): QuickAddProjectOption | null {
  const lower = token.toLowerCase();
  return (
    projects.find((p) => p.name.toLowerCase() === lower) ??
    projects.find((p) => p.name.toLowerCase().startsWith(lower)) ??
    null
  );
}

/**
 * `PROJECT_TOKEN_RE` only captures the first word after "#" (hashtags don't
 * normally contain spaces), but `matchProject` resolves against a project's
 * *full* name via a prefix match — so "#Side project" matching "Side
 * project" must strip the whole name, not just "#Side" (leaving a stray
 * "project" behind). Returns the full "#<name>" span length when the text
 * right after "#" spells out the matched project's whole name (case-
 * insensitive, word-boundary-checked); otherwise just the single token's.
 */
function matchedSpanLength(
  text: string,
  hashIndex: number,
  tokenLength: number,
  project: QuickAddProjectOption,
): number {
  const afterHash = text.slice(hashIndex + 1);
  const lowerName = project.name.toLowerCase();
  if (!afterHash.toLowerCase().startsWith(lowerName)) return 1 + tokenLength;
  const boundaryChar = afterHash[lowerName.length];
  if (boundaryChar !== undefined && /\w/.test(boundaryChar)) return 1 + tokenLength;
  return 1 + lowerName.length;
}

/**
 * "Tomorrow 17:00" (time omitted when all-day) — Quick Add's date-chip
 * label. Reuses `formatDueLabel`'s Today/Tomorrow/Yesterday/short-date
 * wording (components/tasks/due-label.ts) and only adds the time-of-day
 * the chip needs.
 */
export function formatQuickAddDueLabel(
  dueAt: Date,
  isAllDay: boolean,
  tz: string,
  now: Date = new Date(),
): string {
  const { label } = formatDueLabel(dueAt, false, tz, now);
  if (isAllDay) return label;
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dueAt);
  return `${label} ${time}`;
}

/**
 * Live-parses Quick Add's title field into a due date + "#project" token
 * (V2 S5 / B81), reusing the Dump's date/title extraction (`parseTask`,
 * `lib/dump/parser.ts`) so the two capture surfaces can't disagree on what
 * counts as a date. Pure and timezone-aware — `tz` should be the caller's
 * local zone (Quick Add uses the browser's, same as the Dump).
 *
 * `@label` tokens are intentionally not handled here: they're only
 * meaningful "if labels for the chosen project are already available
 * client-side" (OFFLINE-OUTBOX §9.2), and Quick Add is a global sheet with
 * no board open, so no label list is ever available to match against.
 */
export function parseQuickAddTitle(
  raw: string,
  opts: { now?: Date; tz: string; projects: QuickAddProjectOption[] },
): QuickAddParse {
  const now = opts.now ?? new Date();
  if (!raw.trim()) {
    return {
      cleanTitle: "",
      dateStrippedTitle: "",
      dueAt: null,
      isAllDay: false,
      dueLabel: null,
      project: null,
      projectToken: null,
      projectUnknown: false,
      priority: null,
      priorityStrippedTitle: "",
    };
  }

  const task = parseTask(raw, now, opts.tz);
  const dateStrippedTitle = task.title;

  // Priority token (V2 S9/B85): matched against the raw input, not
  // `dateStrippedTitle` — so its chip's × only undoes the priority
  // phrase, leaving any date/#project text exactly as typed, mirroring
  // how `dateStrippedTitle` only undoes the date phrase.
  const rawPriorityMatch = findPriorityMatch(raw);
  const priority = rawPriorityMatch?.priority ?? null;
  const priorityStrippedTitle = rawPriorityMatch
    ? stripToken(raw, rawPriorityMatch.index, rawPriorityMatch.length)
    : raw;

  // Building the submitted title: strip the priority token from the
  // date-stripped text (re-matched there, since removing the date phrase
  // shifts indices), then the "#project" token from what's left.
  let working = dateStrippedTitle;
  const workingPriorityMatch = findPriorityMatch(working);
  if (workingPriorityMatch) {
    working = stripToken(working, workingPriorityMatch.index, workingPriorityMatch.length);
  }

  const match = PROJECT_TOKEN_RE.exec(working);
  let project: QuickAddProjectOption | null = null;
  let projectToken: string | null = null;
  let projectUnknown = false;
  let cleanTitle = working;

  if (match) {
    projectToken = match[1];
    project = matchProject(projectToken, opts.projects);
    if (project) {
      const spanLength = matchedSpanLength(working, match.index, projectToken.length, project);
      cleanTitle = stripToken(working, match.index, spanLength);
    } else {
      projectUnknown = true;
    }
  }

  const dueLabel = task.dueAt
    ? formatQuickAddDueLabel(task.dueAt, task.isAllDay, opts.tz, now)
    : null;

  return {
    cleanTitle,
    dateStrippedTitle,
    dueAt: task.dueAt,
    isAllDay: task.isAllDay,
    dueLabel,
    project,
    projectToken,
    projectUnknown,
    priority,
    priorityStrippedTitle,
  };
}
