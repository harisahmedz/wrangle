import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const urlish = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Must be an http(s) URL");

export const createItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(["course", "book", "video", "article", "skill", "other"]),
  sourceUrl: urlish.optional(),
  whyNote: z.string().trim().max(2000).optional(),
  targetDate: isoDate.optional(),
});

export const itemIdSchema = z.object({ itemId: z.string().uuid() });

export const updateItemSchema = z.object({
  itemId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  type: z.enum(["course", "book", "video", "article", "skill", "other"]),
  status: z.enum(["want", "learning", "learned"]),
  sourceUrl: urlish,
  whyNote: z.string().trim().max(2000),
  targetDate: isoDate.or(z.literal("")),
});

export const setStatusSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(["want", "learning", "learned"]),
});

export const addSessionSchema = z.object({
  itemId: z.string().uuid(),
  happenedOn: isoDate,
  minutes: z.number().int().min(1).max(1440),
  note: z.string().trim().max(300).optional(),
});

export const sessionIdSchema = z.object({ sessionId: z.string().uuid() });

export const addMilestoneSchema = z.object({
  itemId: z.string().uuid(),
  text: z.string().trim().min(1).max(200),
});

export const milestoneIdSchema = z.object({ milestoneId: z.string().uuid() });

export const setManualProgressSchema = z.object({
  itemId: z.string().uuid(),
  progressPct: z.number().int().min(0).max(100),
});

export const addResourceSchema = z.object({
  itemId: z.string().uuid(),
  url: z.string().trim().url().max(500),
  title: z.string().trim().max(120).optional(),
});

export const resourceIdSchema = z.object({ resourceId: z.string().uuid() });

export const addNoteSchema = z.object({
  itemId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
});

export const noteIdSchema = z.object({ noteId: z.string().uuid() });

export const linkToBoardSchema = z.object({
  itemId: z.string().uuid(),
  projectId: z.string().uuid(),
});
