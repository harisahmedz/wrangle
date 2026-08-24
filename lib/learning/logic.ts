import type { learningStatus } from "@/db/schema";

type Status = (typeof learningStatus.enumValues)[number];

export const STATUS_ORDER: Status[] = ["want", "learning", "learned"];

export function nextStatus(s: Status): Status | null {
  const i = STATUS_ORDER.indexOf(s);
  return i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : null;
}

export function prevStatus(s: Status): Status | null {
  const i = STATUS_ORDER.indexOf(s);
  return i > 0 ? STATUS_ORDER[i - 1] : null;
}

export function computeProgress(
  milestonesDone: number,
  milestonesTotal: number,
): number {
  if (milestonesTotal === 0) return 0;
  return Math.round((milestonesDone / milestonesTotal) * 100);
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export const TYPE_META: Record<string, { emoji: string; label: string }> = {
  course: { emoji: "🎓", label: "Course" },
  book: { emoji: "📖", label: "Book" },
  video: { emoji: "🎬", label: "Video" },
  article: { emoji: "📰", label: "Article" },
  skill: { emoji: "🛠️", label: "Skill" },
  other: { emoji: "📦", label: "Other" },
};
