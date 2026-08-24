"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DumpItem } from "@/lib/dump/parser";

export type BucketKind = DumpItem["kind"];

export const BUCKET_ORDER: { kind: BucketKind; emoji: string; label: string }[] = [
  { kind: "expense", emoji: "💸", label: "Expense" },
  { kind: "idea", emoji: "💡", label: "Idea" },
  { kind: "task", emoji: "☑", label: "Task" },
  { kind: "learning", emoji: "📚", label: "Learning" },
];

export const BUCKET_META: Record<
  BucketKind,
  { emoji: string; label: string }
> = Object.fromEntries(
  BUCKET_ORDER.map((b) => [b.kind, { emoji: b.emoji, label: b.label }]),
) as Record<BucketKind, { emoji: string; label: string }>;

export type TrayRow = {
  id: string;
  kind: BucketKind;
  title: string;
  dueAt: Date | null;
  isAllDay: boolean;
  amountMinor: number | null;
  spentOn: string;
  minutes: number;
};

function formatDueChip(dueAt: Date, isAllDay: boolean): string {
  const d = new Date(dueAt);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  if (isAllDay) return weekday.toLowerCase();
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
  return `${weekday.toLowerCase()} ${time}`;
}

export function TrayRowItem({
  row,
  rowError,
  amountValue,
  topics,
  topicsReady,
  categories,
  categoriesReady,
  categoryValue,
  topicValue,
  disabled,
  onPatch,
  onRecast,
  onRemove,
  onAmountChange,
  onCategoryChange,
  onTopicChange,
}: {
  row: TrayRow;
  rowError?: string;
  amountValue: string;
  topics: { id: string; title: string }[];
  topicsReady: boolean;
  categories: { id: string; name: string }[];
  categoriesReady: boolean;
  categoryValue: string;
  topicValue: string;
  disabled?: boolean;
  onPatch: (patch: Partial<TrayRow>) => void;
  onRecast: () => void;
  onRemove: () => void;
  onAmountChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onTopicChange: (value: string) => void;
}) {
  const meta = BUCKET_META[row.kind];
  const titleField = row.kind === "expense" ? "note" : row.kind === "learning" ? "topic" : "title";
  const titlePlaceholder =
    row.kind === "expense"
      ? "What was it?"
      : row.kind === "learning"
        ? "What did you learn?"
        : "Title";

  return (
    <li className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRecast}
          disabled={disabled}
          aria-label={`Recast row — currently ${meta.label}`}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm transition-colors hover:border-accent disabled:opacity-50"
        >
          <span aria-hidden="true">{meta.emoji}</span>
          <span>{meta.label}</span>
        </button>
        <div className="min-w-0 flex-1">
          {row.kind === "task" ? (
            <div className="flex items-center gap-2">
              <Input
                value={row.title}
                onChange={(e) => onPatch({ title: e.target.value })}
                maxLength={300}
                aria-label="Task title"
                placeholder={titlePlaceholder}
                className="h-10"
                disabled={disabled}
              />
              {row.dueAt && (
                <span className="shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-fg">
                  {formatDueChip(row.dueAt, row.isAllDay)}
                </span>
              )}
            </div>
          ) : (
            <Input
              value={row.title}
              onChange={(e) => onPatch({ title: e.target.value })}
              maxLength={row.kind === "expense" ? 500 : 300}
              aria-label={titleField === "note" ? "Expense note" : "Topic"}
              placeholder={titlePlaceholder}
              className="h-10"
              disabled={disabled}
            />
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove row"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:text-danger disabled:opacity-50"
        >
          <span aria-hidden="true" className="text-lg leading-none">✕</span>
        </button>
      </div>

      {row.kind === "expense" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
            <input
              value={amountValue}
              onChange={(e) => onAmountChange(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount in dollars"
              disabled={disabled}
              className={cn(
                "h-10 w-28 rounded-md border bg-surface pl-7 pr-3 text-sm",
                rowError ? "border-danger" : "border-border",
                "placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50",
              )}
            />
          </div>
          <input
            type="date"
            value={row.spentOn}
            onChange={(e) =>
              onPatch({ spentOn: e.target.value || row.spentOn })
            }
            aria-label="Spent on"
            disabled={disabled}
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
          />
        </div>
      )}

      {row.kind === "learning" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={1440}
            value={row.minutes}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              onPatch({ minutes: Math.min(1440, Math.max(1, Math.round(next))) });
            }}
            aria-label="Minutes"
            disabled={disabled}
            className="h-10 w-20 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <span className="text-xs text-muted">min</span>
          <select
            value={topicValue}
            onChange={(e) => onTopicChange(e.target.value)}
            aria-label="Learning item"
            disabled={disabled || !topicsReady}
            className="h-10 min-w-40 flex-1 rounded-md border border-border bg-surface px-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="">New item — “{row.title}”</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {rowError && <p className="mt-2 text-xs text-danger">{rowError}</p>}

      {row.kind === "expense" && categoriesReady && (
        <select
          value={categoryValue}
          onChange={(e) => onCategoryChange(e.target.value)}
          aria-label="Expense category"
          disabled={disabled}
          className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
        >
          <option value="">Category — auto</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}
