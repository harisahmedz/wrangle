import { formatMinor } from "@/lib/money";
import type { WeekReview } from "@/lib/weekly/stats";
import type { WrappedStats } from "@/lib/wrapped/types";

/** "2h 15m", "40m", "0m". */
function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/** Up to 8 short "label: value" strings from numbers the page already shows. */
export function weekRecapFacts(r: WeekReview): string[] {
  const facts = [`cards closed: ${r.shippedCount}`];
  const top = [...r.shippedByProject].sort((a, b) => b.cards.length - a.cards.length)[0];
  if (top) facts.push(`top project: ${top.name}`);
  if (r.learningMinutesTotal > 0) facts.push(`learning: ${minutesLabel(r.learningMinutesTotal)}`);
  if (r.spentMinorTotal > 0 && r.dominantCurrency) {
    facts.push(`spent: ${formatMinor(r.spentMinorTotal, r.dominantCurrency)}`);
  }
  facts.push(`slipped: ${r.slipped.length}`);
  facts.push(`ideas captured: ${r.ideasCaptured}`);
  return facts.slice(0, 8);
}

export function monthRecapFacts(s: WrappedStats): string[] {
  const facts = [`cards closed: ${s.shippedCount}`];
  if (s.topProject) facts.push(`top project: ${s.topProject.name}`);
  if (s.learningMinutesTotal > 0) facts.push(`learning: ${minutesLabel(s.learningMinutesTotal)}`);
  if (s.spentMinorTotal > 0 && s.dominantCurrency) {
    facts.push(`spent: ${formatMinor(s.spentMinorTotal, s.dominantCurrency)}`);
  }
  facts.push(`ideas captured: ${s.ideasCaptured}`);
  facts.push(`active days: ${s.activeDays.length}`);
  return facts.slice(0, 8);
}
