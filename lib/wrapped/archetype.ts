import type { WrappedStats } from "@/lib/wrapped/types";

export type Archetype = { label: string; tagline: string };

export function pickArchetype(stats: WrappedStats): Archetype {
  const shippedPerWeek =
    stats.shippedCount / Math.max(1, stats.daysInMonth / 7);
  const learnHours = stats.learningMinutesTotal / 60;
  const ideaRatio = stats.ideasCaptured / Math.max(1, stats.shippedCount);

  if (shippedPerWeek >= 5 && learnHours >= 8) {
    return {
      label: "The Builder-Scholar",
      tagline: "Ships by day, studies by night.",
    };
  }
  if (shippedPerWeek >= 5 && stats.ideasCaptured >= 8) {
    return {
      label: "The Explorer-Maker",
      tagline: "Half compass, half hammer.",
    };
  }
  if (shippedPerWeek >= 5) {
    return {
      label: "The Builder",
      tagline: "Turns lists into finished things.",
    };
  }
  if (learnHours >= 8 && ideasDominant(ideaRatio, stats.ideasCaptured)) {
    return {
      label: "The Scholar-Dreamer",
      tagline: "Learns deeply, imagines widely.",
    };
  }
  if (learnHours >= 8) {
    return {
      label: "The Scholar",
      tagline: "Quiet compounding, one session at a time.",
    };
  }
  if (ideaRatio >= 2 && stats.ideasCaptured >= 3) {
    return {
      label: "The Dreamer",
      tagline: "The future, drafted nightly.",
    };
  }
  if (ledgerKeeps(stats)) {
    return {
      label: "The Ledger-Keeper",
      tagline: "Knows where every dollar went.",
    };
  }
  return {
    label: "The Steady Hand",
    tagline: "Shows up and keeps the loop turning.",
  };
}

function ideasDominant(ideaRatio: number, ideasCaptured: number): boolean {
  return ideaRatio >= 1 && ideasCaptured >= 5;
}

function ledgerKeeps(stats: WrappedStats): boolean {
  return (
    stats.expenseDaysCount >= 3 &&
    stats.expenseDaysCount * 2 >= stats.activeDays.length &&
    stats.spentMinorTotal > 0
  );
}
