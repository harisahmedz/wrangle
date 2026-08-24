import { z } from "zod";

export const shutdownCardSchema = z.object({
  cardId: z.string().uuid(),
});

export const dayNoteSchema = z.object({
  note: z.string().trim().max(500),
});

export const closeDaySchema = z.object({
  note: z.string().trim().max(500).optional(),
});
