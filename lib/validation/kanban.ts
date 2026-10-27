import { z } from "zod";
import { boardKind } from "@/db/schema";

export const createColumnSchema = z.object({
  boardId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
});

export const columnIdSchema = z.object({
  columnId: z.string().uuid(),
});

export const deleteColumnSchema = z.object({
  columnId: z.string().uuid(),
  targetColumnId: z.string().uuid().optional(),
});

export const createCardSchema = z.object({
  columnId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  atTop: z.boolean().optional(),
  // Additive (V2 S5 / Q12, docs/OFFLINE-OUTBOX.md §9.2.3): the outbox's
  // client mutation layer generates the id and (once online) a fractional
  // position up front, so a replayed create is idempotent and the row can
  // render optimistically before the server round-trip resolves.
  id: z.string().uuid().optional(),
  position: z.string().trim().min(1).max(100).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  isAllDay: z.boolean().optional(),
});

const boardKindSchema = z.enum(boardKind.enumValues);

/**
 * Quick Add v2's "#project" target (V2 S5, docs/OFFLINE-OUTBOX.md §9.2.7):
 * the client resolves a project + board kind, never a column id — the
 * server picks that board's first column, same as `quickAddCard` used to
 * hardcode for My Space only.
 */
export const createCardForProjectSchema = z.object({
  projectId: z.string().uuid(),
  boardKind: boardKindSchema,
  title: z.string().trim().min(1).max(300),
  id: z.string().uuid().optional(),
  position: z.string().trim().min(1).max(100).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  isAllDay: z.boolean().optional(),
});

export const updateCardSchema = z.object({
  cardId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000),
  dueAt: z.string().datetime({ offset: true }).nullable(),
  isAllDay: z.boolean(),
});

export const moveCardSchema = z.object({
  cardId: z.string().uuid(),
  toColumnId: z.string().uuid(),
  position: z.string().min(1).max(100),
});

export const cardIdSchema = z.object({
  cardId: z.string().uuid(),
});
