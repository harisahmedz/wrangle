import { generateKeyBetween } from "fractional-indexing";

/**
 * Generic drag-reorder over a fractional-indexed list: returns the new
 * ordered array plus the moved item's new position, or null when the
 * move is a no-op. Used by board columns and the project sidebar;
 * unit-tested directly (tests/unit/reorder-by-id.test.ts).
 */
export function reorderById<T extends { id: string; position: string }>(
  items: T[],
  activeId: string,
  overId: string,
): { items: T[]; id: string; position: string } | null {
  const from = items.findIndex((c) => c.id === activeId);
  const to = items.findIndex((c) => c.id === overId);
  if (from === -1 || to === -1 || from === to) return null;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  const before = next[to - 1]?.position ?? null;
  const after = next[to + 1]?.position ?? null;
  const position = generateKeyBetween(before, after);

  return { items: next, id: activeId, position };
}
