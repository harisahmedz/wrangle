export type LearnItemRow = {
  id: string;
  title: string;
  type: string;
  status: "want" | "learning" | "learned";
  sourceUrl: string | null;
  whyNote: string | null;
  targetDate: string | null;
  progressPct: number;
  hoursLogged: string;
};

export const TYPE_EMOJI: Record<string, string> = {
  course: "🎓",
  book: "📖",
  video: "🎬",
  article: "📰",
  skill: "🛠️",
  other: "📦",
};
