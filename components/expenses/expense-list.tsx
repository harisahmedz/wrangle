"use client";

import { useState } from "react";
import { ExpenseSheet } from "@/components/expenses/add-expense-sheet";
import { formatMinor } from "@/lib/money";
import type { CategoryChip, ExpenseRow } from "@/components/expenses/types";

export function ExpenseList({
  rows,
  categories,
  cloudinaryReady,
}: {
  rows: ExpenseRow[];
  categories: CategoryChip[];
  cloudinaryReady: boolean;
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
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm text-muted">Nothing logged this month.</p>
            <button
              onClick={openAdd}
              className="mt-2 text-sm font-medium text-accent-strong hover:underline"
            >
              Add your first expense
            </button>
          </div>
        )}

        {Object.entries(grouped)
          .sort(([a], [b]) => (a > b ? -1 : 1))
          .map(([day, dayRows]) => (
            <div key={day} className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {dayRows.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => openEdit(r)}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2"
                    >
                      <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                        style={{
                          backgroundColor: r.categoryColor
                            ? `${r.categoryColor}22`
                            : undefined,
                        }}
                      >
                        {r.categoryEmoji ?? "💸"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {r.note || r.categoryName}
                        </span>
                        <span className="block text-xs text-muted">
                          {r.categoryName}
                          {r.receiptUrl && (
                            <>
                              {" · "}
                              <a
                                href={r.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="underline underline-offset-2 hover:text-text"
                              >
                                📎 receipt
                              </a>
                            </>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-sm font-medium">
                        {formatMinor(r.amountMinor)}
                      </span>
                    </button>
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
        editing={
          editing
            ? {
                id: editing.id,
                amountMinor: editing.amountMinor,
                categoryId: editing.categoryId,
                spentOn: editing.spentOn,
                note: editing.note,
                receiptUrl: editing.receiptUrl,
              }
            : null
        }
      />
    </>
  );
}

