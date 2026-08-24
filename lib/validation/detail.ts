import { z } from "zod";

export const cardIdSchema = z.object({ cardId: z.string().uuid() });

export const checklistItemSchema = z.object({
  itemId: z.string().uuid(),
});

export const addChecklistItemSchema = z.object({
  cardId: z.string().uuid(),
  text: z.string().trim().min(1).max(500),
});

export const labelSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const labelIdSchema = z.object({ labelId: z.string().uuid() });

export const setCardLabelsSchema = z.object({
  cardId: z.string().uuid(),
  labelIds: z.array(z.string().uuid()).max(20),
});

export const setCardAssigneesSchema = z.object({
  cardId: z.string().uuid(),
  userIds: z.array(z.string().uuid()).max(20),
});

export const addCommentSchema = z.object({
  cardId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
});

export const commentIdSchema = z.object({ commentId: z.string().uuid() });

export const signUploadSchema = z.object({
  cardId: z.string().uuid(),
  mime: z.string(),
  bytes: z.number().int().positive(),
});

export const confirmAttachmentSchema = z.object({
  cardId: z.string().uuid(),
  publicId: z.string().min(1).max(200),
  url: z.string().url(),
  mime: z.string(),
  bytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const attachmentIdSchema = z.object({
  attachmentId: z.string().uuid(),
});
