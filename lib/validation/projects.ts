import { z } from "zod";

export const PROJECT_EMOJIS = [
  "🏠", "💼", "🎯", "📚", "🛠️", "🌱", "🔥", "⚡",
  "🧠", "💡", "🎨", "🏃", "🍳", "✈️", "🎵", "💰",
  "📈", "🧹", "❤️", "🐾", "🏡", "📝", "🔬", "🎬",
] as const;

export const PROJECT_COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#14b8a6", "#64748b",
] as const;

const emojiSchema = z.enum(PROJECT_EMOJIS);
const colorSchema = z.enum(PROJECT_COLORS);

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  emoji: emojiSchema.optional(),
  color: colorSchema.optional(),
});

export const updateProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  emoji: emojiSchema,
  color: colorSchema,
});

export const projectIdSchema = z.object({
  projectId: z.string().uuid(),
});

export const moveProjectSchema = z.object({
  projectId: z.string().uuid(),
  direction: z.enum(["up", "down"]),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
