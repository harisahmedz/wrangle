import { z } from "zod";
import { PROJECT_COLORS } from "@/lib/palette";

export const PROJECT_EMOJIS = [
  "🏠", "💼", "🎯", "📚", "🛠️", "🌱", "🔥", "⚡",
  "🧠", "💡", "🎨", "🏃", "🍳", "✈️", "🎵", "💰",
  "📈", "🧹", "❤️", "🐾", "🏡", "📝", "🔬", "🎬",
] as const;

export { PROJECT_COLORS };

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

export const reorderProjectSchema = z.object({
  projectId: z.string().uuid(),
  position: z.string().regex(/^[A-Za-z0-9]+$/),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
