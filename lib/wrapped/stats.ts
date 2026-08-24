import { localDateParts } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { daysInMonth, monthLabelFromParts } from "@/lib/wrapped/month";
import type {
  PlotTwist,
  StatInputs,
  WrappedStats,
} from "@/lib/wrapped/types";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localDateString(date: Date, timeZone: string): string {
  const { y, m, d } = localDateParts(date, timeZone);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function weekdayOfLocalDate(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function weekIndexOfLocalDate(dateStr: string): number {
  return Math.floor((Number(dateStr.slice(8, 10)) - 1) / 7);
}

type Ranked<T> = { key: string; value: T; score: number };

function rankBy<T>(
  map: Map<string, T>,
  scoreOf: (value: T) => number,
): Ranked<T> | null {
  let best: Ranked<T> | null = null;
  for (const [key, value] of map) {
    const score = scoreOf(value);
    if (
      best === null ||
      score > best.score ||
      (score === best.score && key < best.key)
    ) {
      best = { key, value, score };
    }
  }
  return best;
}

export function pickPlotTwist(stats: WrappedStats): PlotTwist | null {
  const weeks = stats.productivityPerWeek.length;
  const maxSpend = weeks ? Math.max(...stats.spendPerWeek) : 0;

  if (weeks >= 2 && maxSpend > 0) {
    let cheapestIdx = -1;
    let cheapestSpend = Infinity;
    let busiestIdx = 0;
    let busiestScore = -Infinity;
    for (let i = 0; i < weeks; i++) {
      if (stats.spendPerWeek[i] > 0 && stats.spendPerWeek[i] < cheapestSpend) {
        cheapestSpend = stats.spendPerWeek[i];
        cheapestIdx = i;
      }
      if (stats.productivityPerWeek[i] > busiestScore) {
        busiestScore = stats.productivityPerWeek[i];
        busiestIdx = i;
      }
    }
    if (
      cheapestIdx >= 0 &&
      cheapestIdx === busiestIdx &&
      cheapestSpend < maxSpend &&
      busiestScore > 0
    ) {
      return {
        kind: "cheapest-week",
        sentence: "Your cheapest week was your most productive one.",
      };
    }
  }

  const hours = stats.learningMinutesTotal / 60;
  if (hours >= 5 && stats.spentMinorTotal > 0 && stats.dominantCurrency) {
    const perHourMinor = Math.round(stats.spentMinorTotal / hours);
    return {
      kind: "per-learning-hour",
      sentence: `About ${formatMinor(perHourMinor, stats.dominantCurrency)} per learning hour.`,
    };
  }

  let bestWeekday = -1;
  let bestWeekdayCount = 0;
  for (let i = 0; i < 7; i++) {
    if (stats.completedByWeekday[i] > bestWeekdayCount) {
      bestWeekdayCount = stats.completedByWeekday[i];
      bestWeekday = i;
    }
  }
  if (bestWeekday >= 0 && bestWeekdayCount >= 3) {
    return {
      kind: "best-weekday",
      sentence: `${WEEKDAY_NAMES[bestWeekday]}s were your power day — ${bestWeekdayCount} shipped.`,
    };
  }

  if (stats.ideasCaptured >= 3 && stats.ideasCaptured > stats.shippedCount) {
    return {
      kind: "ideas-ratio",
      sentence: `You captured more ideas than you shipped — ${stats.ideasCaptured} sparks are waiting.`,
    };
  }

  return null;
}

export function computeStats(inputs: StatInputs): WrappedStats {
  const { timeZone } = inputs;
  const monthLabel = monthLabelFromParts(inputs.year, inputs.monthIndex);
  const totalDays = daysInMonth(inputs.year, inputs.monthIndex);
  const weekCount = Math.ceil(totalDays / 7);

  const activeDaySet = new Set<string>();
  const completionsByDay = new Map<string, number>();
  const projectCounts = new Map<string, number>();
  const completedByWeekday = [0, 0, 0, 0, 0, 0, 0];

  for (const card of inputs.completedCards) {
    const day = localDateString(card.completedAt, timeZone);
    activeDaySet.add(day);
    completionsByDay.set(day, (completionsByDay.get(day) ?? 0) + 1);
    projectCounts.set(card.projectName, (projectCounts.get(card.projectName) ?? 0) + 1);
    completedByWeekday[weekdayOfLocalDate(day)] += 1;
  }

  for (const e of inputs.expenses) activeDaySet.add(e.spentOn);
  for (const s of inputs.sessions) activeDaySet.add(s.happenedOn);
  for (const r of inputs.closedReviews) activeDaySet.add(r.date);

  const minutesByItem = new Map<string, number>();
  const learningDays = new Set<string>();
  let learningMinutesTotal = 0;
  for (const s of inputs.sessions) {
    learningMinutesTotal += s.minutes;
    learningDays.add(s.happenedOn);
    minutesByItem.set(s.itemTitle, (minutesByItem.get(s.itemTitle) ?? 0) + s.minutes);
  }

  const spendByCurrency = new Map<string, number>();
  const categoryTotals = new Map<string, { emoji: string; minor: number }>();
  const expenseDays = new Set<string>();
  for (const e of inputs.expenses) {
    spendByCurrency.set(e.currency, (spendByCurrency.get(e.currency) ?? 0) + e.amountMinor);
    expenseDays.add(e.spentOn);
    const entry = categoryTotals.get(e.categoryName) ?? {
      emoji: e.categoryEmoji ?? "📦",
      minor: 0,
    };
    entry.minor += e.amountMinor;
    categoryTotals.set(e.categoryName, entry);
  }

  let dominantCurrency: string | null = null;
  let dominantMinor = 0;
  const otherCurrencyTotals: { currency: string; minor: number }[] = [];
  for (const [currency, minor] of spendByCurrency) {
    if (dominantCurrency === null || minor > dominantMinor) {
      if (dominantCurrency !== null) {
        otherCurrencyTotals.push({ currency: dominantCurrency, minor: dominantMinor });
      }
      dominantCurrency = currency;
      dominantMinor = minor;
    } else {
      otherCurrencyTotals.push({ currency, minor });
    }
  }
  otherCurrencyTotals.sort((a, b) => b.minor - a.minor);

  const productivityPerWeek = Array.from({ length: weekCount }, () => 0);
  const spendPerWeek = Array.from({ length: weekCount }, () => 0);
  for (const card of inputs.completedCards) {
    productivityPerWeek[weekIndexOfLocalDate(localDateString(card.completedAt, timeZone))] += 1;
  }
  for (const s of inputs.sessions) {
    productivityPerWeek[weekIndexOfLocalDate(s.happenedOn)] += s.minutes / 60;
  }
  for (const e of inputs.expenses) {
    if (e.currency === dominantCurrency) {
      spendPerWeek[weekIndexOfLocalDate(e.spentOn)] += e.amountMinor;
    }
  }

  const topProject = rankBy(projectCounts, (count) => count);
  const topLearningItem = rankBy(minutesByItem, (minutes) => minutes);
  const topCategory = rankBy(categoryTotals, (entry) => entry.minor);

  const stats: WrappedStats = {
    monthLabel,
    shippedCount: inputs.completedCards.length,
    topProject: topProject ? { name: topProject.key, count: topProject.score } : null,
    completedByWeekday,
    ideasCaptured: inputs.ideas.length,
    learningMinutesTotal,
    topLearningItem: topLearningItem
      ? { title: topLearningItem.key, minutes: topLearningItem.score }
      : null,
    learningDaysCount: learningDays.size,
    dominantCurrency,
    spentMinorTotal: dominantMinor,
    otherCurrencyTotals,
    topCategory: topCategory
      ? { name: topCategory.key, emoji: topCategory.value.emoji, minor: topCategory.value.minor }
      : null,
    expenseDaysCount: expenseDays.size,
    productivityPerWeek: productivityPerWeek.map((v) => Math.round(v * 100) / 100),
    spendPerWeek,
    activeDays: [...activeDaySet].sort(),
    daysInMonth: totalDays,
    plotTwist: null,
    allTime: inputs.allTime,
  };

  stats.plotTwist = pickPlotTwist(stats) ?? shippingSpikeTwist(completionsByDay, monthLabel);
  return stats;
}

function shippingSpikeTwist(
  completionsByDay: Map<string, number>,
  monthLabel: string,
): PlotTwist | null {
  let bestDay: string | null = null;
  let bestCount = 1;
  for (const [day, count] of completionsByDay) {
    if (count > bestCount || (count === bestCount && bestDay !== null && day < bestDay)) {
      bestCount = count;
      bestDay = day;
    }
  }
  if (!bestDay) return null;
  const monthName = monthLabel.split(" ")[0];
  const dayNum = Number(bestDay.slice(8, 10));
  return {
    kind: "shipping-spike",
    sentence: `${monthName} ${dayNum} was your biggest day — ${bestCount} cards shipped.`,
  };
}
