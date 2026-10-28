// Pure reducers that lay the outbox over server props (docs/OFFLINE-OUTBOX.md
// §2.3). They *are* the optimistic state for queued kinds — unlike
// `useOptimistic` they survive navigation, reload and being offline, since
// the entries come from IndexedDB. Entries apply in id order (UUIDv7 =
// creation order); every status is overlaid (a `failed` entry stays visible
// until the user discards it from the review sheet).
import { generateKeyBetween } from "fractional-indexing";
import type { BoardKind } from "@/db/schema";
import type { ChecklistRow } from "@/components/kanban/detail-sections";
import type { LearnItemRow } from "@/components/learn/types";
import type { CategoryChip, ExpenseRow } from "@/components/expenses/types";
import type { BoardCardData, BoardColumnData } from "@/lib/kanban/types";
import type { Mutation, OutboxEntry } from "@/lib/outbox/types";

export type SyncState = "pending" | "failed";

const byId = (a: OutboxEntry, b: OutboxEntry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function overlayCards(
  cards: BoardCardData[],
  columns: BoardColumnData[],
  entries: OutboxEntry[],
  /** The board on screen, so a Quick Add `{projectId, boardKind}` create lands in its first column. */
  scope?: { projectId: string; boardKind: BoardKind },
): BoardCardData[] {
  if (entries.length === 0) return cards;
  const columnIds = new Set(columns.map((c) => c.id));
  const doneColumns = new Set(columns.filter((c) => c.isDone).map((c) => c.id));
  const firstColumn = [...columns].sort((a, b) => (a.position < b.position ? -1 : 1))[0];
  let out = cards;
  const index = () => new Map(out.map((c, i) => [c.id, i]));

  for (const e of [...entries].sort(byId)) {
    const m = e.mutation;
    const when = new Date(e.createdAt).toISOString();
    if (m.kind === "card.create") {
      if (out.some((c) => c.id === m.id)) continue;
      let columnId: string | null = null;
      if ("columnId" in m.target) {
        if (columnIds.has(m.target.columnId)) columnId = m.target.columnId;
      } else if (
        scope &&
        firstColumn &&
        m.target.projectId === scope.projectId &&
        m.target.boardKind === scope.boardKind
      ) {
        columnId = firstColumn.id;
      }
      if (!columnId) continue;
      const last = out
        .filter((c) => c.columnId === columnId)
        .reduce<string | null>((max, c) => (max === null || c.position > max ? c.position : max), null);
      out = [
        ...out,
        {
          id: m.id,
          columnId,
          title: m.title,
          hasDescription: false,
          dueAt: m.dueAt ?? null,
          completedAt: null,
          position: m.position ?? generateKeyBetween(last, null),
          coverColor: null,
          labelColors: [],
          labelIds: [],
          assigneeIds: [],
          impact: null,
          effort: null,
          priority: m.priority ?? null,
        },
      ];
      continue;
    }
    if (m.kind !== "card.update" && m.kind !== "card.complete" && m.kind !== "card.move") continue;
    const i = index().get(m.cardId);
    if (i === undefined) continue;
    const card = out[i];
    let next: BoardCardData | null = null;
    if (m.kind === "card.update") {
      next = {
        ...card,
        ...(m.patch.title !== undefined ? { title: m.patch.title } : {}),
        ...(m.patch.dueAt !== undefined ? { dueAt: m.patch.dueAt } : {}),
        ...(m.patch.description !== undefined ? { hasDescription: !!m.patch.description } : {}),
        ...(m.patch.priority !== undefined ? { priority: m.patch.priority } : {}),
      };
    } else if (m.kind === "card.complete") {
      next = { ...card, completedAt: m.completed ? (card.completedAt ?? when) : null };
    } else if (m.kind === "card.move") {
      if (!columnIds.has(m.toColumnId)) continue;
      // Mirrors the server's auto-complete on `isDone` columns (apply.ts).
      const completedAt = doneColumns.has(m.toColumnId) ? (card.completedAt ?? when) : null;
      next = { ...card, columnId: m.toColumnId, position: m.position, completedAt };
    }
    if (next) out = out.map((c, j) => (j === i ? next! : c));
  }
  return out;
}

export function overlayChecklist(items: ChecklistRow[], entries: OutboxEntry[]): ChecklistRow[] {
  if (entries.length === 0) return items;
  let out = items;
  for (const e of [...entries].sort(byId)) {
    const m = e.mutation;
    if (m.kind !== "checklist.set") continue;
    out = out.map((it) => (it.id === m.itemId ? { ...it, isDone: m.isDone } : it));
  }
  return out;
}

export function overlayLearning(items: LearnItemRow[], entries: OutboxEntry[]): LearnItemRow[] {
  if (entries.length === 0) return items;
  let out = items;
  for (const e of [...entries].sort(byId)) {
    const m = e.mutation;
    if (m.kind !== "learning.setStatus") continue;
    out = out.map((it) => (it.id === m.itemId ? { ...it, status: m.status } : it));
  }
  return out;
}

export function overlayExpenses(
  rows: ExpenseRow[],
  entries: OutboxEntry[],
  categories: CategoryChip[],
  currency: string,
  /** `YYYY-MM` of the month on screen; creates for other months are skipped. */
  monthKey: string,
): ExpenseRow[] {
  if (entries.length === 0) return rows;
  let out = rows;
  for (const e of [...entries].sort(byId)) {
    const m = e.mutation;
    if (m.kind !== "expense.create") continue;
    if (!m.spentOn.startsWith(monthKey) || out.some((r) => r.id === m.id)) continue;
    const cat = categories.find((c) => c.id === m.categoryId);
    out = [
      {
        id: m.id,
        amountMinor: m.amountMinor,
        spentOn: m.spentOn,
        note: m.note || null,
        categoryId: m.categoryId,
        categoryName: cat?.name ?? "Uncategorised",
        categoryEmoji: cat?.emoji ?? null,
        categoryColor: cat?.color ?? null,
        receiptUrl: null,
        paymentMethod: m.paymentMethod || null,
        currency,
      },
      ...out,
    ];
  }
  return out;
}

/** The ids a mutation touches, for `syncStateOf`. */
function targetsOf(m: Mutation): string[] {
  switch (m.kind) {
    case "card.create":
    case "expense.create":
      return [m.id];
    case "card.update":
    case "card.complete":
    case "card.move":
      return [m.cardId];
    case "checklist.set":
      return [m.itemId];
    case "learning.setStatus":
      return [m.itemId];
  }
}

/** `failed` wins over `pending`; `null` when nothing is queued for the entity. */
export function syncStateOf(entityId: string, entries: OutboxEntry[]): SyncState | null {
  let pending = false;
  for (const e of entries) {
    if (!targetsOf(e.mutation).includes(entityId)) continue;
    if (e.status === "failed") return "failed";
    pending = true;
  }
  return pending ? "pending" : null;
}

/**
 * The queued `card.update` patches for a card, folded in id order — the
 * card detail sheet lays this over the server card to get its baseline
 * (initial field values, dirty check, and the next patch's diff), so an
 * edit made offline is what the user sees when they reopen the card.
 */
export function cardPatchOf(
  cardId: string,
  entries: OutboxEntry[],
): Extract<Mutation, { kind: "card.update" }>["patch"] {
  let patch: Extract<Mutation, { kind: "card.update" }>["patch"] = {};
  for (const e of [...entries].sort(byId)) {
    const m = e.mutation;
    if (m.kind === "card.update" && m.cardId === cardId) patch = { ...patch, ...m.patch };
  }
  return patch;
}

/** The queued completion state of a card (last `card.complete` wins), or null. */
export function completionOf(cardId: string, entries: OutboxEntry[]): boolean | null {
  let result: boolean | null = null;
  for (const e of [...entries].sort(byId)) {
    const m = e.mutation;
    if (m.kind === "card.complete" && m.cardId === cardId) result = m.completed;
  }
  return result;
}

/** Human label for the review sheet when the call site didn't supply one. */
export function describeMutation(m: Mutation): string {
  switch (m.kind) {
    case "card.create":
      return `Add “${m.title}”`;
    case "card.update":
      return m.patch.title ? `Edit “${m.patch.title}”` : "Edit a card";
    case "card.complete":
      return m.completed ? "Complete a card" : "Reopen a card";
    case "card.move":
      return "Move a card";
    case "checklist.set":
      return m.isDone ? "Tick a checklist item" : "Untick a checklist item";
    case "learning.setStatus":
      return `Mark as ${m.status}`;
    case "expense.create":
      return "Add an expense";
  }
}
