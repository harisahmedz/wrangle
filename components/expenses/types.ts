export type CategoryChip = {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
};

export type ExpenseRow = {
  id: string;
  amountMinor: number;
  spentOn: string;
  note: string | null;
  categoryId: string;
  categoryName: string;
  categoryEmoji: string | null;
  categoryColor: string | null;
  receiptUrl: string | null;
};
