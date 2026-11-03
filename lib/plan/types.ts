// The props the Upcoming page hands to PlanButton → PlanSheet (assembled by
// `loadPlanInput` in lib/plan/candidates.ts). Types only: PlanButton sits in
// /upcoming's first-load JS, where the chunk guard forbids lib/plan values.
import type { BoardKind } from "@/db/schema";
import type { PlanCandidate } from "@/lib/plan/schedule";

export type PlanInputCard = PlanCandidate & {
  title: string;
  projectId: string;
  projectName: string;
  boardKind: BoardKind;
};

export type PlanInput = {
  timeZone: string;
  /** The user's local today, "YYYY-MM-DD", computed on the server. */
  todayKey: string;
  dailyCap: number;
  weekendCap: number;
  /** Already ranked and capped at 40 by the loader; never a viewer's card. */
  candidates: PlanInputCard[];
};
