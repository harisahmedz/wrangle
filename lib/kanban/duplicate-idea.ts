// Duplicate-idea check, step 1 (V3 S5 / A5): pure string matching against the
// board's open ideas. Step 2 is the AI task in lib/ai/tasks/same-idea.ts.

export type IdeaRef = { id: string; title: string };

/** Lowercase, strip punctuation, collapse spaces. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const wordCount = (s: string) => (s ? s.split(" ").length : 0);

/** Exact match, or one title containing the other when both have at least 3 words. */
export function findCodeMatch(title: string, ideas: IdeaRef[]): IdeaRef | null {
  const n = normalizeTitle(title);
  if (!n) return null;
  const nWords = wordCount(n);
  let near: IdeaRef | null = null;
  for (const idea of ideas) {
    const m = normalizeTitle(idea.title);
    if (!m) continue;
    if (m === n) return idea;
    if (!near && nWords >= 3 && wordCount(m) >= 3 && (m.includes(n) || n.includes(m))) near = idea;
  }
  return near;
}

/** The board's open (not completed) cards as match candidates. */
export function openIdeas(cards: Array<IdeaRef & { completedAt: string | null }>): IdeaRef[] {
  return cards.filter((c) => c.completedAt === null).map((c) => ({ id: c.id, title: c.title }));
}
