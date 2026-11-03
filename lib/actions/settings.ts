"use server";

import { signOut } from "@/auth";
import { refresh } from "next/cache";
import { eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  boards,
  cards,
  expenses,
  invites,
  projects,
  users,
  verificationTokens,
} from "@/db/schema";
import type { Theme } from "@/db/schema";
import { requireMembership, requireUser } from "@/lib/authz";
import { destroyAsset, isCloudinaryConfigured } from "@/lib/cloudinary";
import { updateProfileSchema } from "@/lib/validation/settings";
import {
  aiPrefSchema,
  LEARN_VIEW_KEY,
  PLAN_CAP_MAX,
  planPrefSchema,
  viewPrefSchema,
} from "@/lib/validation/prefs";
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

/**
 * Settings → AI mode (ROADMAP-V3 S0): `off` | `on-device` |
 * `on-device-then-openrouter`, stored in `users.prefs.ai.mode` so it syncs
 * across devices. Only the mode: the OpenRouter key never reaches the server.
 * Same atomic jsonb merge as `setViewPref` below; `refresh()` because the
 * app layout re-reads the mode for `AiModeProvider`.
 */
export async function setAiMode(formData: FormData): Promise<ActionResult> {
  const userId = await requireUser();

  const parsed = aiPrefSchema.safeParse({ mode: formData.get("mode") });
  if (!parsed.success) return failure("Invalid AI mode");

  await db
    .update(users)
    .set({
      prefs: sql`coalesce(${users.prefs}, '{}'::jsonb) || jsonb_build_object(
        'ai',
        coalesce(${users.prefs}->'ai', '{}'::jsonb) || ${JSON.stringify(parsed.data)}::jsonb
      )`,
    })
    .where(eq(users.id, userId));

  refresh();
  return { ok: true };
}

/**
 * Settings → Plan my week caps (ROADMAP-V3 S6): `users.prefs.plan =
 * { dailyCap, weekendCap }`, read by `loadPlanInput` when the sheet opens.
 * Same atomic jsonb merge as `setAiMode` above.
 */
export async function setPlanPrefs(formData: FormData): Promise<ActionResult> {
  const userId = await requireUser();

  const parsed = planPrefSchema.safeParse({
    dailyCap: Number(formData.get("dailyCap")),
    weekendCap: Number(formData.get("weekendCap")),
  });
  if (!parsed.success) return failure(`Caps must be whole numbers: 1–${PLAN_CAP_MAX} on weekdays, 0–${PLAN_CAP_MAX} at weekends`);

  await db
    .update(users)
    .set({
      prefs: sql`coalesce(${users.prefs}, '{}'::jsonb) || jsonb_build_object(
        'plan',
        coalesce(${users.prefs}->'plan', '{}'::jsonb) || ${JSON.stringify(parsed.data)}::jsonb
      )`,
    })
    .where(eq(users.id, userId));

  refresh();
  return { ok: true };
}

/**
 * Sets one board's view preference (ROADMAP-V2 D1, F1): Layout/Group
 * by/Sort/Show completed, persisted per user so it syncs across devices.
 * Only writes the caller's own `users.prefs` row.
 */
export async function setViewPref(formData: FormData): Promise<ActionResult> {
  const userId = await requireUser();

  const boardId = String(formData.get("boardId") ?? "");
  if (!boardId) return failure("Missing board");

  let patchRaw: unknown;
  try {
    patchRaw = JSON.parse(String(formData.get("patch") ?? "{}"));
  } catch {
    return failure("Invalid preference");
  }
  const parsed = viewPrefSchema.safeParse(patchRaw);
  if (!parsed.success) return failure("Invalid preference");

  // `LEARN_VIEW_KEY` is the one non-board key in `views` — Learn is personal
  // (no project), so it skips the board lookup/membership check below.
  if (boardId !== LEARN_VIEW_KEY) {
    const [board] = await db
      .select({ projectId: boards.projectId })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);
    if (!board) return failure("Board not found");
    await requireMembership(board.projectId, "viewer");
  }

  // One atomic UPDATE instead of read-merge-write (SELECT then UPDATE would
  // lose a concurrent write from another tab/device). Built with nested `||`
  // (jsonb shallow-merge) + `jsonb_build_object` rather than `jsonb_set`:
  // `jsonb_set` only fills in the *last* path segment when missing — it
  // leaves `target` untouched if an earlier segment (here, "views") doesn't
  // already exist, which silently no-ops on a brand-new `prefs` column.
  // The merge semantics (innermost patch wins per field, other boards and
  // other top-level pref keys untouched) match the pure `mergeViewPref` in
  // lib/validation/prefs.ts, kept there for tests/documentation — not used
  // on this write path.
  await db
    .update(users)
    .set({
      prefs: sql`coalesce(${users.prefs}, '{}'::jsonb) || jsonb_build_object(
        'views',
        coalesce(${users.prefs}->'views', '{}'::jsonb) || jsonb_build_object(
          ${boardId}::text,
          coalesce(${users.prefs} #> ARRAY['views', ${boardId}], '{}'::jsonb) || ${JSON.stringify(parsed.data)}::jsonb
        )
      )`,
    })
    .where(eq(users.id, userId));

  // Deliberately no refresh(): the View menu applies the change client-side
  // immediately; this just persists it for the next load/other devices.
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
