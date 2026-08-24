import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dumpTaskSchema = z.object({
  kind: z.literal("task"),
  title: z.string().trim().min(1).max(300),
  dueAtIso: z.string().datetime({ offset: true }).nullable(),
  isAllDay: z.boolean(),
});

export const dumpIdeaSchema = z.object({
  kind: z.literal("idea"),
  title: z.string().trim().min(1).max(300),
});

export const dumpExpenseSchema = z.object({
  kind: z.literal("expense"),
  amountMinor: z.number().int().positive().max(100_000_000),
  note: z.string().trim().max(500),
  spentOn: isoDate,
  categoryId: z.string().uuid().optional(),
});

export const dumpLearningSchema = z.object({
  kind: z.literal("learning"),
  minutes: z.number().int().min(1).max(1440),
  topic: z.string().trim().min(1).max(300),
  learningItemId: z.string().uuid().optional(),
});

export const dumpSaveSchema = z
  .array(
    z.discriminatedUnion("kind", [
      dumpTaskSchema,
      dumpIdeaSchema,
      dumpExpenseSchema,
      dumpLearningSchema,
    ]),
  )
  .min(1)
  .max(50);

export type DumpSaveInput = z.infer<typeof dumpSaveSchema>;
