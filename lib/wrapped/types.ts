export const WRAPPED_UNLOCK_DAYS = 15;

export type CompletedCardRow = {
  id: string;
  title: string;
  projectName: string;
  projectEmoji: string | null;
  completedAt: Date;
};

export type IdeaCardRow = {
  id: string;
  title: string;
};

export type LearningSessionRow = {
  minutes: number;
  itemTitle: string;
  happenedOn: string;
};

export type ExpenseRow = {
  amountMinor: number;
  currency: string;
  categoryName: string;
  categoryEmoji: string | null;
  spentOn: string;
};

export type ClosedReviewRow = {
  date: string;
};

export type AllTimeTotals = {
  loopsClosed: number;
  minutesLearned: number;
  sinceDate: string | null;
};

export type PlotTwist = {
  kind:
    | "cheapest-week"
    | "per-learning-hour"
    | "best-weekday"
    | "ideas-ratio"
    | "shipping-spike";
  sentence: string;
};

export type WrappedStats = {
  monthLabel: string;
  shippedCount: number;
  topProject: { name: string; count: number } | null;
  completedByWeekday: number[];
  ideasCaptured: number;
  learningMinutesTotal: number;
  topLearningItem: { title: string; minutes: number } | null;
  learningDaysCount: number;
  dominantCurrency: string | null;
  spentMinorTotal: number;
  otherCurrencyTotals: { currency: string; minor: number }[];
  topCategory: { name: string; emoji: string; minor: number } | null;
  expenseDaysCount: number;
  productivityPerWeek: number[];
  spendPerWeek: number[];
  activeDays: string[];
  daysInMonth: number;
  plotTwist: PlotTwist | null;
  allTime: AllTimeTotals;
};

export type StatInputs = {
  timeZone: string;
  year: number;
  monthIndex: number;
  completedCards: CompletedCardRow[];
  ideas: IdeaCardRow[];
  sessions: LearningSessionRow[];
  expenses: ExpenseRow[];
  closedReviews: ClosedReviewRow[];
  allTime: AllTimeTotals;
};
