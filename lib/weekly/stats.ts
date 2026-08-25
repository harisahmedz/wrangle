import { localDateParts } from "@/lib/dates";
import { localDateKey } from "@/lib/shutdown/stats";

const DAY_MS = 86_400_000;

type DateTimeParts = {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
};

function localDateTimeParts(date: Date, timeZone: string): DateTimeParts {
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
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    y: parts.year,
    m: parts.month,
    d: parts.day,
    h: parts.hour === 24 ? 0 : parts.hour,
    mi: parts.minute,
    s: parts.second,
  };
}

function tzOffsetMs(instantMs: number, timeZone: string): number {
  const p = localDateTimeParts(new Date(instantMs), timeZone);
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return wall - instantMs;
}

function fromWall(
  y: number,
  monthIndex: number,
  d: number,
  timeZone: string,
): number {
  const naive = Date.UTC(y, monthIndex, d);
  const pass1 = naive - tzOffsetMs(naive, timeZone);
  return naive - tzOffsetMs(pass1, timeZone);
}

/**
 * The Monday–Sunday week containing `now`, shifted by `offsetWeeks`
 * (0 = this week, -1 = last week). Timezone-aware.
 */
export function weekWindow(
  now: Date,
  timeZone: string,
  offsetWeeks = 0,
): { start: Date; end: Date } {
  const shifted = new Date(now.getTime() + offsetWeeks * 7 * DAY_MS);
  const { y, m, d } = localDateParts(shifted, timeZone);
  // 0 = Sunday … 6 = Saturday → days since Monday
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const startMs = fromWall(y, m - 1, d - daysSinceMonday, timeZone);
  return { start: new Date(startMs), end: new Date(startMs + 7 * DAY_MS) };
}

export function weekLabel(win: { start: Date; end: Date }): string {
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${day.format(win.start)} – ${day.format(new Date(win.end.getTime() - DAY_MS))}`;
}

export type ShippedCardRow = {
  id: string;
  title: string;
  projectName: string;
  projectEmoji: string | null;
};

export type SlippedCardRow = {
  id: string;
  title: string;
  projectName: string;
  dueAt: Date;
  isAllDay: boolean;
};

export type WeeklySessionRow = { minutes: number; itemTitle: string };

export type WeeklyExpenseRow = {
  amountMinor: number;
  currency: string;
  categoryName: string;
  categoryEmoji: string | null;
};

export type WeeklyIdeaRow = {
  id: string;
  title: string;
  impact: number | null;
  effort: number | null;
};

/** G4-01 idea score: impact*2 − effort; unscored ideas sort last. */
export function scoreOf(impact: number | null, effort: number | null): number | null {
  if (impact === null || effort === null) return null;
  return impact * 2 - effort;
}

export type WeekReview = {
  weekLabel: string;
  containsToday: boolean;
  shippedCount: number;
  shippedByProject: Array<{
    name: string;
    emoji: string | null;
    cards: Array<{ id: string; title: string }>;
  }>;
  slipped: Array<SlippedCardRow>;
  learningMinutesTotal: number;
  sessionCount: number;
  topLearningItem: { title: string; minutes: number } | null;
  dominantCurrency: string | null;
  spentMinorTotal: number;
  otherCurrencyTotals: Array<{ currency: string; minor: number }>;
  lastWeekSpentMinor: number;
  topCategory: { name: string; emoji: string; minor: number } | null;
  ideasCaptured: number;
  topIdea: { id: string; title: string; score: number } | null;
};

export type WeekReviewInputs = {
  now: Date;
  timeZone: string;
  offsetWeeks?: number;
  shipped: ShippedCardRow[];
  slipped: SlippedCardRow[];
  sessions: WeeklySessionRow[];
  expenses: WeeklyExpenseRow[];
  lastWeekExpenses: WeeklyExpenseRow[];
  ideas: WeeklyIdeaRow[];
};

export function computeWeekReview(inputs: WeekReviewInputs): WeekReview {
  const { now, timeZone } = inputs;
  const offsetWeeks = inputs.offsetWeeks ?? 0;
  const win = weekWindow(now, timeZone, offsetWeeks);

  const byProject = new Map<
    string,
    { name: string; emoji: string | null; cards: Array<{ id: string; title: string }> }
  >();
  for (const card of inputs.shipped) {
    let entry = byProject.get(card.projectName);
    if (!entry) {
      entry = { name: card.projectName, emoji: card.projectEmoji, cards: [] };
      byProject.set(card.projectName, entry);
    }
    entry.cards.push({ id: card.id, title: card.title });
  }

  const slipped = [...inputs.slipped].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  const minutesByItem = new Map<string, number>();
  for (const s of inputs.sessions) {
    minutesByItem.set(s.itemTitle, (minutesByItem.get(s.itemTitle) ?? 0) + s.minutes);
  }
  let topLearningItem: WeekReview["topLearningItem"] = null;
  for (const [title, minutes] of minutesByItem) {
    if (
      topLearningItem === null ||
      minutes > topLearningItem.minutes ||
      (minutes === topLearningItem.minutes && title < topLearningItem.title)
    ) {
      topLearningItem = { title, minutes };
    }
  }

  const totalsByCurrency = new Map<string, number>();
  for (const e of inputs.expenses) {
    totalsByCurrency.set(e.currency, (totalsByCurrency.get(e.currency) ?? 0) + e.amountMinor);
  }
  const ranked = [...totalsByCurrency.entries()].sort(
    ([curA, minA], [curB, minB]) =>
      minB - minA || curA.localeCompare(curB),
  );
  const dominantCurrency = ranked[0]?.[0] ?? null;
  const spentMinorTotal = ranked[0]?.[1] ?? 0;
  const otherCurrencyTotals = ranked
    .slice(1)
    .map(([currency, minor]) => ({ currency, minor }));

  const lastWeekTotal = inputs.lastWeekExpenses
    .filter((e) => e.currency === dominantCurrency)
    .reduce((sum, e) => sum + e.amountMinor, 0);

  const byCategory = new Map<string, { name: string; emoji: string; minor: number }>();
  for (const e of inputs.expenses) {
    if (e.currency !== dominantCurrency) continue;
    const key = `${e.categoryName}\u0000${e.categoryEmoji ?? ""}`;
    const existing = byCategory.get(key);
    if (existing) {
      existing.minor += e.amountMinor;
    } else {
      byCategory.set(key, {
        name: e.categoryName,
        emoji: e.categoryEmoji ?? "",
        minor: e.amountMinor,
      });
    }
  }
  let topCategory: WeekReview["topCategory"] = null;
  for (const cat of byCategory.values()) {
    if (
      topCategory === null ||
      cat.minor > topCategory.minor ||
      (cat.minor === topCategory.minor && cat.name < topCategory.name)
    ) {
      topCategory = cat;
    }
  }

  let topIdea: WeekReview["topIdea"] = null;
  for (const idea of inputs.ideas) {
    const score = scoreOf(idea.impact, idea.effort);
    if (score === null) continue;
    if (
      topIdea === null ||
      score > topIdea.score ||
      (score === topIdea.score && idea.id < topIdea.id)
    ) {
      topIdea = { id: idea.id, title: idea.title, score };
    }
  }

  return {
    weekLabel: weekLabel(win),
    containsToday:
      localDateKey(now, timeZone) >= localDateKey(win.start, timeZone) &&
      localDateKey(now, timeZone) < localDateKey(win.end, timeZone),
    shippedCount: inputs.shipped.length,
    shippedByProject: [...byProject.values()],
    slipped,
    learningMinutesTotal: inputs.sessions.reduce((sum, s) => sum + s.minutes, 0),
    sessionCount: inputs.sessions.length,
    topLearningItem,
    dominantCurrency,
    spentMinorTotal,
    otherCurrencyTotals,
    lastWeekSpentMinor: lastWeekTotal,
    topCategory,
    ideasCaptured: inputs.ideas.length,
    topIdea,
  };
}
