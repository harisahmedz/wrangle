export type CategoryHint = { note: string; categoryId: string };

/**
 * Step 1 of the category suggestion (no AI): the category of the user's most
 * recent expense whose note equals `note` (trimmed, case-insensitive).
 * `hints` must be newest first; ids not in `validIds` (archived) are skipped.
 */
export function categoryFromHistory(
  note: string,
  hints: CategoryHint[],
  validIds: Set<string>,
): string | null {
  const key = note.trim().toLowerCase();
  if (!key) return null;
  for (const h of hints) {
    if (h.note.trim().toLowerCase() === key && validIds.has(h.categoryId)) return h.categoryId;
  }
  return null;
}
