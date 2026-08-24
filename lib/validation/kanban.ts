import { z } from "zod";

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
