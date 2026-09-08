"use client";

import { useEffect, useState } from "react";
import { ExpenseSheet } from "@/components/expenses/add-expense-sheet";
import type { CategoryChip } from "@/components/expenses/types";

export function AddExpenseButton({
  categories,
  cloudinaryReady,
  defaultSpentOn,
  currency,
}: {
  categories: CategoryChip[];
  cloudinaryReady: boolean;
  defaultSpentOn: string;
  currency: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onEvent = () => setOpen(true);
    window.addEventListener("wrangle-expense-add", onEvent);
    return () => window.removeEventListener("wrangle-expense-add", onEvent);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Add expense"
        className="inline-flex h-11 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg"
      >
        + Add
      </button>
      <ExpenseSheet
        open={open}
        onClose={() => setOpen(false)}
        categories={categories}
        cloudinaryReady={cloudinaryReady}
        defaultSpentOn={defaultSpentOn}
        currency={currency}
      />
    </>
  );
}
