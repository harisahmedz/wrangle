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
        className="hidden h-11 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg md:inline-flex"
      >
        + Add
      </button>
      <button
        onClick={() => setOpen(true)}
        aria-label="Add expense"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+64px)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-accent-fg shadow-lg transition-transform active:scale-95 md:hidden"
      >
        +
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
