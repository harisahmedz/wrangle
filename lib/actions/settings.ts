"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { Theme } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { updateProfileSchema } from "@/lib/validation/settings";
import { failure, type ActionResult } from "@/lib/actions/types";

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const userId = await requireUser();

  const parsed = updateProfileSchema.safeParse({
    theme: formData.get("theme") ?? undefined,
    timezone: formData.get("timezone") ?? undefined,
  });
  if (!parsed.success) return failure("Invalid settings");

  const updates: { theme?: Theme; timezone?: string } = {};
  if (parsed.data.theme) updates.theme = parsed.data.theme;
  if (parsed.data.timezone) updates.timezone = parsed.data.timezone;
  if (!updates.theme && !updates.timezone) return { ok: true };

  await db.update(users).set(updates).where(eq(users.id, userId));

  refresh();
  return { ok: true };
}
