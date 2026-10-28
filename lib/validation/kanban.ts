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

// The card create/update/move shapes (incl. S9's `priority`) moved to
// lib/validation/outbox.ts in V2 S8 — those mutations are queued
// (docs/OFFLINE-OUTBOX.md), not Server Actions, so their schemas live with
// the wire format.

export const cardIdSchema = z.object({
  cardId: z.string().uuid(),
});
