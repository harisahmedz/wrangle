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
};

const PROJECT_TOKEN_RE = /#([^\s#]+)/;

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
    };
  }

  const task = parseTask(raw, now, opts.tz);
  const dateStrippedTitle = task.title;

  const match = PROJECT_TOKEN_RE.exec(dateStrippedTitle);
  let project: QuickAddProjectOption | null = null;
  let projectToken: string | null = null;
  let projectUnknown = false;
  let cleanTitle = dateStrippedTitle;

  if (match) {
    projectToken = match[1];
    project = matchProject(projectToken, opts.projects);
    if (project) {
      const spanLength = matchedSpanLength(dateStrippedTitle, match.index, projectToken.length, project);
      cleanTitle = stripToken(dateStrippedTitle, match.index, spanLength);
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
  };
}
