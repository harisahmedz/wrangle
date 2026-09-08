"use server";

import { signOut } from "@/auth";
import { refresh } from "next/cache";
import { eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  cards,
  expenses,
  invites,
  projects,
  users,
  verificationTokens,
} from "@/db/schema";
import type { Theme } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { destroyAsset, isCloudinaryConfigured } from "@/lib/cloudinary";
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

export async function deleteAccount(formData: FormData): Promise<ActionResult> {
  const userId = await requireUser();
  if (formData.get("confirmation") !== "DELETE") {
    return failure("Type DELETE to confirm account deletion");
  }

  const [profile] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!profile) return failure("Account not found");

  const ownedProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, userId));
  const ownedProjectIds = ownedProjects.map((project) => project.id);

  const uploadedAssets = await db
    .selectDistinct({ publicId: attachments.cloudinaryPublicId })
    .from(attachments)
    .leftJoin(cards, eq(attachments.cardId, cards.id))
    .where(
      ownedProjectIds.length
        ? or(
            eq(attachments.uploadedBy, userId),
            inArray(cards.projectId, ownedProjectIds),
          )
        : eq(attachments.uploadedBy, userId),
    );
  const receipts = await db
    .select({ publicId: expenses.receiptPublicId })
    .from(expenses)
    .where(eq(expenses.userId, userId));
  const publicIds = Array.from(
    new Set(
      [...uploadedAssets, ...receipts]
        .map((asset) => asset.publicId)
        .filter((publicId): publicId is string => Boolean(publicId)),
    ),
  );

  if (isCloudinaryConfigured() && publicIds.length) {
    const removed = await Promise.all(publicIds.map(destroyAsset));
    if (removed.some((result) => !result)) {
      return failure("Could not remove every uploaded file. Please try again.");
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(attachments).where(eq(attachments.uploadedBy, userId));
    await tx.delete(invites).where(eq(invites.createdBy, userId));
    await tx.delete(projects).where(eq(projects.ownerId, userId));
    await tx
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, profile.email));
    await tx.delete(users).where(eq(users.id, userId));
  });

  await signOut({ redirectTo: "/" });
  return { ok: true };
}
