import { generateKeyBetween } from "fractional-indexing";

/**
 * True when `key` is a well-formed fractional-indexing order key (valid
 * head/length, no trailing zero). Every client-supplied `position` must pass
 * this before it reaches the DB: one bad key stored in a column makes every
 * later `generateKeyBetween` on that column throw (S8 security review M1).
 */
export function isValidPositionKey(key: string): boolean {
  // The library's own check doesn't reject every stray character (a trailing
  // space passes), so pin the alphabet to base-62 first.
  if (!/^[0-9A-Za-z]+$/.test(key)) return false;
  try {
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}

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
