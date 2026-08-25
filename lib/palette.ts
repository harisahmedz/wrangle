/**
 * The single palette source (UI-UX §1 rule 3).
 * Label colors, category colors, project colors, column colors and
 * card covers are all views over these eight hues. Never hardcode a
 * hex in a component — add it here first (both themes read tokens for
 * chrome colors; this palette only drives user-chosen accents).
 */
export const PALETTE = [
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // violet (the app accent)
  "#ec4899", // pink
  "#14b8a6", // teal
  "#64748b", // slate
] as const;

export type PaletteColor = (typeof PALETTE)[number];

/** Fallback accent when a user-chosen color is absent. */
export const ACCENT_HEX: PaletteColor = "#8b5cf6";

// --- Domain views over the one source ---

export const PROJECT_COLORS: readonly PaletteColor[] = PALETTE;

export const LABEL_COLORS: readonly PaletteColor[] = PALETTE;

export const CATEGORY_COLORS: readonly PaletteColor[] = [
  PALETTE[1], PALETTE[3], PALETTE[7], PALETTE[5],
  PALETTE[2], PALETTE[4], PALETTE[6], PALETTE[0],
];

export const COLUMN_COLORS: Array<PaletteColor | null> = [
  null,
  PALETTE[0],
  PALETTE[1],
  PALETTE[2],
  PALETTE[3],
  PALETTE[4],
  PALETTE[5],
];

export const COVER_SWATCHES: string[] = [
  "",
  PALETTE[0],
  PALETTE[1],
  PALETTE[2],
  PALETTE[3],
  PALETTE[4],
  PALETTE[5],
];
