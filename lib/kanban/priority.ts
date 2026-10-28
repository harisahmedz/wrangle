/**
 * Card priority (ROADMAP-V2 S9/B85, D3). Ring colors: P1 red, P2 orange,
 * P3 blue, P4 none — same as no priority at all. Storage convention
 * (documented in architecture-and-data.md §5): `cards.priority` is a
 * nullable smallint whose CHECK allows 1–4, but the app only ever writes
 * 1 | 2 | 3 | null — "P4" (Todoist's default/no-flag tier) is written as
 * NULL, never as the literal 4, so there's exactly one "no priority"
 * state to branch on everywhere else in the app (sorting, rings, filters).
 * `normalizePriority` is the one place that folds a user-typed/stored 4
 * (or anything else out of range) down to null; call it at every
 * read/write boundary (quick-add parsing, the detail picker, insertCard,
 * updateCard, and when shaping a DB row into `BoardCardData`/`DueCardRow`).
 */
export type CardPriority = 1 | 2 | 3;

export const PRIORITY_VALUES: readonly CardPriority[] = [1, 2, 3];

export function normalizePriority(
  raw: number | null | undefined,
): CardPriority | null {
  return raw === 1 || raw === 2 || raw === 3 ? raw : null;
}

/** Unchecked `TaskRow`/`CardDetail` circle: colored ring + faint tint. */
export const PRIORITY_RING_CLASS: Record<CardPriority, string> = {
  1: "border-priority-1 bg-priority-1/10",
  2: "border-priority-2 bg-priority-2/10",
  3: "border-priority-3 bg-priority-3/10",
};

/** `CardChip`'s left accent bar — same hue as the ring, board context. */
export const PRIORITY_ACCENT_CLASS: Record<CardPriority, string> = {
  1: "border-l-4 border-l-priority-1",
  2: "border-l-4 border-l-priority-2",
  3: "border-l-4 border-l-priority-3",
};

/** Quick Add's live "P1"–"P3" chip (and a neutral look for a typed "p4"). */
export const PRIORITY_CHIP_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "bg-priority-1/15 text-priority-1",
  2: "bg-priority-2/15 text-priority-2",
  3: "bg-priority-3/15 text-priority-3",
  4: "bg-surface-2 text-muted",
};

/** `CardDetail`'s P1–P4 picker, selected-state look (P4 = selected "none"). */
export const PRIORITY_BUTTON_CLASS: Record<CardPriority, string> = {
  1: "border-priority-1 bg-priority-1/10 text-priority-1",
  2: "border-priority-2 bg-priority-2/10 text-priority-2",
  3: "border-priority-3 bg-priority-3/10 text-priority-3",
};
