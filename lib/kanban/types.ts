export type BoardCardData = {
  id: string;
  columnId: string;
  title: string;
  hasDescription: boolean;
  dueAt: string | null;
  completedAt: string | null;
  position: string;
  coverColor: string | null;
  labelColors: string[];
  labelIds: string[];
  assigneeIds: string[];
  impact: number | null;
  effort: number | null;
};

export type BoardColumnData = {
  id: string;
  name: string;
  position: string;
  color: string | null;
  wipLimit: number | null;
  isDone: boolean;
  isCollapsed: boolean;
};

export const DUE_FILTER_VALUES = ["overdue", "today", "week", "none"] as const;

export type DueFilter = (typeof DUE_FILTER_VALUES)[number];

export type BoardFilters = {
  q: string;
  labelIds: string[];
  assigneeIds: string[];
  due: DueFilter | null;
};

export const EMPTY_BOARD_FILTERS: BoardFilters = {
  q: "",
  labelIds: [],
  assigneeIds: [],
  due: null,
};

export type BoardSearchRecord = Record<
  string,
  string | string[] | undefined
>;

function readIdList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseBoardFilters(sp: BoardSearchRecord): BoardFilters {
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const due = Array.isArray(sp.due) ? sp.due[0] : sp.due;
  const dueValid = DUE_FILTER_VALUES.includes(due as DueFilter)
    ? (due as DueFilter)
    : null;
  return {
    q: q?.trim() ?? "",
    labelIds: readIdList(sp.label),
    assigneeIds: readIdList(sp.assignee),
    due: dueValid,
  };
}
