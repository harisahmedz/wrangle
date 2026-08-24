export type BoardCardData = {
  id: string;
  columnId: string;
  title: string;
  hasDescription: boolean;
  dueAt: string | null;
  completedAt: string | null;
  position: string;
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
};
