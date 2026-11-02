import { z } from "zod";
import { TIMEZONES } from "@/lib/timezones";

export { TIMEZONES };

export const themeSchema = z.enum(["dark", "light", "system"]);
export const timezoneSchema = z.enum(TIMEZONES);

export const updateProfileSchema = z.object({
  theme: themeSchema.optional(),
  timezone: timezoneSchema.optional(),
});

export type ThemeMode = z.infer<typeof themeSchema>;
