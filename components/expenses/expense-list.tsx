"use client";

import { useState } from "react";
import { ExpenseSheet } from "@/components/expenses/add-expense-sheet";
import { formatMinor } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CategoryChip, ExpenseRow } from "@/components/expenses/types";

export function ExpenseList({
  rows,
  categories,
  cloudinaryReady,
  defaultSpentOn,
  currency,
}: {
  rows: ExpenseRow[];
  categories: CategoryChip[];
  cloudinaryReady: boolean;
  defaultSpentOn: string;
  currency: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);

  const grouped = rows.reduce<Record<string, ExpenseRow[]>>((acc, r) => {
    (acc[r.spentOn] ??= []).push(r);
    return acc;
  }, {});

  const openEdit = (row: ExpenseRow) => {
    setEditing(row);
    setSheetOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  return (
    <>
      <div className="space-y-5">
        {rows.length === 0 && (
          <EmptyState
            icon="💸"
            title="Nothing logged this month"
            description="Add an expense and it shows up here, grouped by day."
            action={
              <Button variant="secondary" size="sm" onClick={openAdd}>
                Add your first expense
              </Button>
            }
          />
        )}

        {Object.entries(grouped)
          .sort(([a], [b]) => (a > b ? -1 : 1))
          .map(([day, dayRows]) => (
            <div key={day} className="space-y-1.5">
              <p className="text-xs font-medium text-muted">
                {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {dayRows.map((r) => (
                  <li key={r.id} className="flex items-stretch">
                    <button
                      onClick={() => openEdit(r)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2"
                    >
                      <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                        style={{
                          backgroundColor: r.categoryColor
                            ? `color-mix(in srgb, ${r.categoryColor} 15%, transparent)`
                            : undefined,
                        }}
                      >
                        {r.categoryEmoji ?? "💸"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {r.note || r.categoryName}
                        </span>
                        <span className="flex gap-2 text-xs text-muted">
                          <span className="truncate">{r.categoryName}</span>
                          {r.paymentMethod && (
                            <span className="truncate">{r.paymentMethod}</span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-sm font-medium">
                        {formatMinor(r.amountMinor, r.currency)}
                      </span>
                    </button>
                    {r.receiptUrl && (
                      <a
                        href={r.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open receipt for ${r.note || r.categoryName}`}
                        className="flex w-11 shrink-0 items-center justify-center text-muted hover:bg-surface-2 hover:text-text"
                      >
                        📎
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>

      <ExpenseSheet
        key={editing?.id ?? "add"}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        categories={categories}
        cloudinaryReady={cloudinaryReady}
        defaultSpentOn={defaultSpentOn}
        currency={currency}
        editing={
          editing
            ? {
                id: editing.id,
                amountMinor: editing.amountMinor,
                categoryId: editing.categoryId,
                spentOn: editing.spentOn,
                note: editing.note,
                receiptUrl: editing.receiptUrl,
                paymentMethod: editing.paymentMethod,
              }
            : null
        }
      />
    </>
  );
}
