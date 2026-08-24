import { z } from "zod";

export const createInviteSchema = z.object({
  projectId: z.string().uuid(),
  role: z.enum(["viewer", "member", "admin"]),
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30)]),
  maxUses: z.number().int().min(1).max(100),
});

export const inviteIdSchema = z.object({
  projectId: z.string().uuid(),
  inviteId: z.string().uuid(),
});

export const changeRoleSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["viewer", "member", "admin"]),
});

export const removeMemberSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const transferOwnershipSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
});
