import { en } from "chrono-node";
import { localDateParts } from "@/lib/dates";

export type DumpTaskItem = {
  id: string;
  kind: "task";
  title: string;
  dueAt: Date | null;
  isAllDay: boolean;
};

export type DumpIdeaItem = {
  id: string;
  kind: "idea";
  title: string;
};

export type DumpExpenseItem = {
  id: string;
  kind: "expense";
  amountMinor: number | null;
  note: string;
  spentOn: string;
};

export type DumpLearningItem = {
  id: string;
  kind: "learning";
  minutes: number;
  topic: string;
};

export type DumpItem =
  | DumpTaskItem
  | DumpIdeaItem
  | DumpExpenseItem
  | DumpLearningItem;

export type ParseDumpOptions = { now?: Date; tz?: string };

export const MAX_DUMP_SEGMENTS = 50;

export const LEARNING_CUE_RE = /^(did|learned|studied|practiced|read)\b/i;

export const EXPENSE_CUES = [
  "spent",
  "paid",
  "bought",
  "fuel",
  "gas",
  "petrol",
  "groceries",
  "lunch",
  "dinner",
  "breakfast",
  "coffee",
  "ticket",
  "uber",
  "taxi",
] as const;

export const EXPENSE_CUE_RE = new RegExp(
  `\\b(${EXPENSE_CUES.join("|")})\\b`,
  "i",
);

export const AMOUNT_RE =
  /([$€£])?\s?(\d{1,9}(?:[.,]\d{1,2})?)(?:\s?(usd|eur|gbp|dollars?|euros?|bucks?|quid))?/i;

export const IDEA_PREFIX_RE = /^idea\b\s*[:\-–—]+\s*/i;

const CLAUSE_START_RE =
  /\b(?=idea\b\s*[:\-–—]|spent\s|learned\s|studied\s|practiced\s|did\s+\d)/gi;

const ELLIPSIS_SPLIT_RE = /…|\.{3}/;

const HOUR_DURATION_RE =
  /(\d+)\s*(?:hours?|hrs?|h)(?:\s*(\d+)\s*(?:minutes?|mins?|mi|m)\b)?(?:\s*(\d+))?/i;

const MINUTE_DURATION_RE = /(\d+)\s*(?:minutes?|mins?|mi|m)(?![a-z])/i;

const LEADING_JUNK_RE = /^["'“”‘’`\-–—…\s]+/;

const LEADING_FILLER_RE = /^(?:the|a|an|my|of|on|in|at|for|to)\s+/i;

const TRAILING_FILLER_RE = /(?:\s+(?:the|a|an|my|of|on|in|at|for|to))+$/i;

const TRAILING_PUNCT_RE = /[\s.,;:!?"'“”‘’…·]+$/;

const PURE_NUMBER_RE = /^\d+$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDateKey(date: Date, timeZone: string): string {
  const { y, m, d } = localDateParts(date, timeZone);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function tzOffsetMs(instantMs: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const part of fmt.formatToParts(new Date(instantMs))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour === 24 ? 0 : parts.hour,
    parts.minute,
    parts.second,
  );
  return wall - instantMs;
}

function wallTime(
  y: number,
  m: number,
  d: number,
  h: number,
  mi: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(y, m - 1, d, h, mi, 0);
  const pass1 = naive - tzOffsetMs(naive, timeZone);
  return new Date(naive - tzOffsetMs(pass1, timeZone));
}

function tidy(input: string): string {
  let out = input;
  for (let i = 0; i < 8; i++) {
    const next = out
      .replace(LEADING_JUNK_RE, "")
      .replace(LEADING_FILLER_RE, "")
      .replace(TRAILING_FILLER_RE, "")
      .replace(TRAILING_PUNCT_RE, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

function capitalize(input: string): string {
  return input ? input.charAt(0).toUpperCase() + input.slice(1) : input;
}

function cut(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`;
}

function cleanSegment(segment: string): string {
  return tidy(segment);
}

function splitClauses(line: string): string[] {
  const marks: number[] = [];
  const re = new RegExp(CLAUSE_START_RE.source, "gi");
  let match = re.exec(line);
  while (match !== null) {
    marks.push(match.index);
    if (match[0].length === 0) re.lastIndex += 1;
    match = re.exec(line);
  }
  if (marks.length === 0) return [line];
  const chunks: string[] = [];
  if (marks[0] > 0) chunks.push(line.slice(0, marks[0]));
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1] : line.length;
    chunks.push(line.slice(marks[i], end));
  }
  return chunks;
}

type DateHit = {
  index: number;
  length: number;
  date: Date;
  certainHour: boolean;
  meridiemCertain: boolean;
  hour: number | null;
  minute: number | null;
};

function firstDateHit(
  text: string,
  now: Date,
  tz: string,
): DateHit | null {
  const results = en.parse(
    text,
    { instant: now, timezone: tz },
    { forwardDate: true },
  );
  for (const result of results) {
    if (PURE_NUMBER_RE.test(result.text.trim())) continue;
    return {
      index: result.index,
      length: result.text.length,
      date: result.start.date(),
      certainHour:
        result.start.isCertain("hour") || result.start.isCertain("minute"),
      meridiemCertain: result.start.isCertain("meridiem"),
      hour: result.start.get("hour"),
      minute: result.start.get("minute"),
    };
  }
  return null;
}

function amountToMinor(raw: string): number {
  const decimal = raw.match(/[.,](\d{1,2})$/);
  let whole = raw;
  let cents = "00";
  if (decimal) {
    whole = raw.slice(0, raw.length - decimal[0].length);
    cents = decimal[1].padEnd(2, "0");
  }
  const intPart = whole.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
  const value = Number(`${intPart || "0"}.${cents}`);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

function parseLearning(seg: string): { minutes: number; topic: string } | null {
  const cue = LEARNING_CUE_RE.exec(seg);
  if (!cue) return null;
  let rest = seg.slice(cue.index + cue[0].length);
  const hourMatch = HOUR_DURATION_RE.exec(rest);
  const minuteMatch = MINUTE_DURATION_RE.exec(rest);
  let minutes: number;
  if (hourMatch && (!minuteMatch || hourMatch.index <= minuteMatch.index)) {
    minutes = Number(hourMatch[1]) * 60 + Number(hourMatch[2] ?? hourMatch[3] ?? 0);
    rest = cut(rest, hourMatch.index, hourMatch[0].length);
  } else if (minuteMatch) {
    minutes = Number(minuteMatch[1]);
    rest = cut(rest, minuteMatch.index, minuteMatch[0].length);
  } else {
    return null;
  }
  if (!Number.isFinite(minutes)) return null;
  minutes = Math.min(1440, Math.max(1, Math.round(minutes)));
  const topic = tidy(rest).slice(0, 300);
  if (!topic) return null;
  return { minutes, topic };
}

function parseExpense(
  seg: string,
  now: Date,
  tz: string,
): { amountMinor: number; note: string; spentOn: string } | null {
  const amountMatch = AMOUNT_RE.exec(seg);
  if (!amountMatch) return null;
  const hasSymbol = Boolean(amountMatch[1] || amountMatch[3]);
  if (!hasSymbol && !EXPENSE_CUE_RE.test(seg)) return null;
  const amountMinor = amountToMinor(amountMatch[2]);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return null;
  if (amountMinor > 100_000_000) return null;

  let rest = cut(seg, amountMatch.index, amountMatch[0].length);
  const dateHit = firstDateHit(rest, now, tz);
  if (dateHit) rest = cut(rest, dateHit.index, dateHit.length);
  rest = rest.replace(EXPENSE_CUE_RE, " ");
  const note = tidy(rest).slice(0, 500);
  const spentOn = isoDateKey(dateHit ? dateHit.date : now, tz);
  return { amountMinor, note, spentOn };
}

function parseTask(
  seg: string,
  now: Date,
  tz: string,
): { title: string; dueAt: Date | null; isAllDay: boolean } {
  const hit = firstDateHit(seg, now, tz);
  if (!hit) {
    return { title: capitalize(tidy(seg)).slice(0, 300), dueAt: null, isAllDay: false };
  }
  const remaining = tidy(cut(seg, hit.index, hit.length));
  const title = capitalize(remaining || tidy(seg)).slice(0, 300);
  if (hit.certainHour) {
    let dueAt = hit.date;
    if (
      !hit.meridiemCertain &&
      hit.hour != null &&
      hit.hour >= 1 &&
      hit.hour <= 7
    ) {
      const parts = localDateParts(hit.date, tz);
      dueAt = wallTime(
        parts.y,
        parts.m,
        parts.d,
        Math.min(hit.hour + 12, 23),
        hit.minute ?? 0,
        tz,
      );
    }
    return { title, dueAt, isAllDay: false };
  }
  const parts = localDateParts(hit.date, tz);
  return {
    title,
    dueAt: wallTime(parts.y, parts.m, parts.d, 12, 0, tz),
    isAllDay: true,
  };
}

function classifySegment(seg: string, id: string, now: Date, tz: string): DumpItem {
  const learning = parseLearning(seg);
  if (learning) {
    return { id, kind: "learning", minutes: learning.minutes, topic: learning.topic };
  }
  const expense = parseExpense(seg, now, tz);
  if (expense) {
    return { id, kind: "expense", ...expense };
  }
  const ideaPrefix = IDEA_PREFIX_RE.exec(seg);
  if (ideaPrefix) {
    const title = tidy(seg.slice(ideaPrefix[0].length)).slice(0, 300);
    if (title) return { id, kind: "idea", title };
  }
  return { id, kind: "task", ...parseTask(seg, now, tz) };
}

export function parseDump(raw: string, opts?: ParseDumpOptions): DumpItem[] {
  const now = opts?.now ?? new Date();
  const tz = opts?.tz ?? "UTC";
  if (!raw || !raw.trim()) return [];

  const segments: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    for (const breath of line.split(ELLIPSIS_SPLIT_RE)) {
      segments.push(...splitClauses(breath));
    }
  }

  const cleaned = segments
    .map(cleanSegment)
    .filter((segment) => segment.length > 0)
    .slice(0, MAX_DUMP_SEGMENTS);

  return cleaned.map((segment, i) => classifySegment(segment, `seg-${i}`, now, tz));
}
