"use client";

// The money page imports this instead of add-expense-sheet.tsx so the sheet
// (and the AI availability hook it uses for category suggestions) is a lazy
// chunk, not first-load code (V3 S3; same pattern as card-detail-lazy.tsx).
import dynamic from "next/dynamic";

export const ExpenseSheet = dynamic(
  () => import("@/components/expenses/add-expense-sheet").then((m) => m.ExpenseSheet),
  { ssr: false },
);
