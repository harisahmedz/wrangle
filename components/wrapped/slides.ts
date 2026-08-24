import { formatMinor } from "@/lib/money";
import type { Archetype } from "@/lib/wrapped/archetype";
import type { WrappedStats } from "@/lib/wrapped/types";

export const SLIDE_PALETTES: readonly [string, string][] = [
  ["#12161f", "#8b5cf6"],
  ["#0b0e14", "#6d28d9"],
  ["#1a1233", "#a78bfa"],
  ["#12161f", "#4c1d95"],
  ["#0b0e14", "#7c3aed"],
  ["#151b2a", "#8b5cf6"],
];

export type SlideContent = {
  id: string;
  eyebrow: string;
  headline: string;
  big: boolean;
  lines: string[];
  footnote: string | null;
  wordmark: boolean;
  palette: number;
};

function hoursShort(minutes: number): string {
  if (minutes === 0) return "0h";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function sinceLabel(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label;
}

export function buildSlides(
  monthLabel: string,
  stats: WrappedStats,
  archetype: Archetype,
): SlideContent[] {
  const spent =
    stats.dominantCurrency && stats.spentMinorTotal > 0
      ? formatMinor(stats.spentMinorTotal, stats.dominantCurrency)
      : formatMinor(0, stats.dominantCurrency ?? "USD");

  const heroStripParts = [
    `${stats.shippedCount} shipped`,
    `${hoursShort(stats.learningMinutesTotal)} learned`,
    `${spent} spent`,
    `${stats.ideasCaptured} ideas`,
  ];

  const slides: SlideContent[] = [
    {
      id: "hero",
      eyebrow: monthLabel,
      headline: archetype.label,
      big: false,
      lines: [archetype.tagline, heroStripParts.join("  ·  ")],
      footnote: null,
      wordmark: false,
      palette: 0,
    },
    {
      id: "shipped",
      eyebrow: "Shipped",
      headline: String(stats.shippedCount),
      big: true,
      lines: [
        "cards completed",
        stats.topProject
          ? `${stats.topProject.count} from ${
              stats.topProject.name
            }`
          : "No projects stood out this month",
      ],
      footnote: null,
      wordmark: false,
      palette: 1,
    },
    {
      id: "learned",
      eyebrow: "Learned",
      headline: hoursShort(stats.learningMinutesTotal),
      big: true,
      lines: [
        `of honest learning across ${stats.learningDaysCount} ${
          stats.learningDaysCount === 1 ? "day" : "days"
        }`,
        stats.topLearningItem
          ? `Most of it: ${stats.topLearningItem.title}`
          : "No sessions yet",
      ],
      footnote: null,
      wordmark: false,
      palette: 2,
    },
    {
      id: "spent",
      eyebrow: "Spent",
      headline: spent,
      big: true,
      lines: [
        stats.topCategory
          ? `Top category: ${stats.topCategory.emoji} ${stats.topCategory.name}`
          : "Nothing logged this month",
      ],
      footnote:
        stats.otherCurrencyTotals.length && stats.dominantCurrency
          ? `Plus ${stats.otherCurrencyTotals
              .map((o) => formatMinor(o.minor, o.currency))
              .join(" + ")} outside ${stats.dominantCurrency}`
          : null,
      wordmark: false,
      palette: 3,
    },
  ];

  if (stats.plotTwist) {
    slides.push({
      id: "twist",
      eyebrow: "Plot twist",
      headline: stats.plotTwist.sentence,
      big: false,
      lines: [],
      footnote: null,
      wordmark: false,
      palette: 4,
    });
  }

  const since = sinceLabel(stats.allTime.sinceDate);
  slides.push({
    id: "all-time",
    eyebrow: "All time",
    headline: String(stats.allTime.loopsClosed),
    big: true,
    lines: [
      "loops closed",
      `${hoursShort(stats.allTime.minutesLearned)} of learning logged`,
      since ? `Since ${since}` : "Your history starts now",
    ],
    footnote: null,
    wordmark: false,
    palette: 5,
  });

  slides.push({
    id: "closer",
    eyebrow: monthLabel,
    headline: "See you next month.",
    big: false,
    lines: [],
    footnote: null,
    wordmark: true,
    palette: 0,
  });

  return slides;
}
