export function scoreOf(
  impact: number | null,
  effort: number | null,
): number | null {
  if (impact === null || effort === null) return null;
  return impact * 2 - effort;
}

export function formatScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}
