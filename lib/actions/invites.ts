"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  invites,
  memberships,
  projects,
} from "@/db/schema";
import type { ProjectRole } from "@/db/schema";
import { requireMembership } from "@/lib/authz";
import { generateInviteToken, hashToken } from "@/lib/sharing/tokens";
import { hitRateLimit } from "@/lib/sharing/ratelimit";
import { canChangeRole, canGrantRole, canRemoveMember } from "@/lib/sharing/permissions";
import {
  changeRoleSchema,
  createInviteSchema,
  inviteIdSchema,
  removeMemberSchema,
  transferOwnershipSchema,
} from "@/lib/validation/sharing";
import { failure, type ActionResult } from "@/lib/actions/types";

const INVITES_PER_PROJECT_PER_HOUR = 10;

export async function createInvite(
  formData: FormData,
): Promise<
  ActionResult<{ token: string; role: ProjectRole; expiresAt: string }>
> {
  const parsed = createInviteSchema.safeParse({
    projectId: formData.get("projectId"),
    role: formData.get("role"),
    expiresInDays: Number(formData.get("expiresInDays")),
    maxUses: Number(formData.get("maxUses")),
  });
  if (!parsed.success) return failure("Invalid invite settings");

  const ctx = await requireMembership(parsed.data.projectId, "admin");
  if (!canGrantRole(ctx.role, parsed.data.role)) {
    return failure("You cannot grant that role");
  }

  const limit = await hitRateLimit(
    `inv:create:${ctx.projectId}`,
    INVITES_PER_PROJECT_PER_HOUR,
    3600,
  );
  if (!limit.allowed) {
    return failure("Too many invites for this project this hour");
  }

  const token = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + parsed.data.expiresInDays * 86_400_000,
  );

  await db.insert(invites).values({
    projectId: ctx.projectId,
    tokenHash: hashToken(token),
    role: parsed.data.role,
    createdBy: ctx.userId,
    expiresAt,
    maxUses: parsed.data.maxUses,
  });

  await db.insert(activities).values({
    projectId: ctx.projectId,
    actorId: ctx.userId,
    entityType: "invite",
    entityId: ctx.projectId,
    verb: "created",
    meta: { role: parsed.data.role },
  });

  revalidatePath("/", "layout");
  return {
    ok: true,
    data: { token, role: parsed.data.role, expiresAt: expiresAt.toISOString() },
  };
}

export async function revokeInvite(formData: FormData): Promise<ActionResult> {
  const parsed = inviteIdSchema.safeParse({
    projectId: formData.get("projectId"),
    inviteId: formData.get("inviteId"),
  });
  if (!parsed.success) return failure("Invalid invite");

  const ctx = await requireMembership(parsed.data.projectId, "admin");

  const result = await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invites.id, parsed.data.inviteId),
        eq(invites.projectId, ctx.projectId),
        isNull(invites.revokedAt),
      ),
    )
    .returning({ id: invites.id });

  if (result.length === 0) return failure("Invite not found or already revoked");

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function listProjectInvites(projectId: string) {
  await requireMembership(projectId, "admin");
  return db
    .select({
      id: invites.id,
      role: invites.role,
      expiresAt: invites.expiresAt,
      maxUses: invites.maxUses,
      usedCount: invites.usedCount,
      revokedAt: invites.revokedAt,
      createdAt: invites.createdAt,
      isExpired: sql<boolean>`(${invites.expiresAt} < now())`,
    })
    .from(invites)
    .where(and(eq(invites.projectId, projectId), isNull(invites.revokedAt)))
    .orderBy(asc(invites.createdAt));
}

export async function changeMemberRole(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = changeRoleSchema.safeParse({
    projectId: formData.get("projectId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return failure("Invalid role change");

  const actorCtx = await requireMembership(parsed.data.projectId, "viewer");

  const [target] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.projectId, parsed.data.projectId),
        eq(memberships.userId, parsed.data.userId),
      ),
    )
    .limit(1);
  if (!target) return failure("Member not found");

  if (!canChangeRole(actorCtx.role, target.role, parsed.data.role)) {
    return failure("Not allowed");
  }

  await db
    .update(memberships)
    .set({ role: parsed.data.role })
    .where(
      and(
        eq(memberships.projectId, parsed.data.projectId),
        eq(memberships.userId, parsed.data.userId),
      ),
    );

  await db.insert(activities).values({
    projectId: parsed.data.projectId,
    actorId: actorCtx.userId,
    entityType: "membership",
    entityId: parsed.data.userId,
    verb: "role-changed",
    meta: { to: parsed.data.role },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeMember(formData: FormData): Promise<ActionResult> {
  const parsed = removeMemberSchema.safeParse({
    projectId: formData.get("projectId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) return failure("Invalid member");

  const actorCtx = await requireMembership(parsed.data.projectId, "viewer");

  const [target] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.projectId, parsed.data.projectId),
        eq(memberships.userId, parsed.data.userId),
      ),
    )
    .limit(1);
  if (!target) return failure("Member not found");

  if (!canRemoveMember(actorCtx.role, target.role)) {
    return failure("Not allowed");
  }

  await db
    .delete(memberships)
    .where(
      and(
        eq(memberships.projectId, parsed.data.projectId),
        eq(memberships.userId, parsed.data.userId),
      ),
    );

  await db.insert(activities).values({
    projectId: parsed.data.projectId,
    actorId: actorCtx.userId,
    entityType: "membership",
    entityId: parsed.data.userId,
    verb: "removed",
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function transferOwnership(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = transferOwnershipSchema.safeParse({
    projectId: formData.get("projectId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) return failure("Invalid transfer");

  const actorCtx = await requireMembership(parsed.data.projectId, "owner");
  if (actorCtx.userId === parsed.data.userId) {
    return failure("Pick another member");
  }

  const [target] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.projectId, parsed.data.projectId),
        eq(memberships.userId, parsed.data.userId),
      ),
    )
    .limit(1);
  if (!target || target.role === "owner") return failure("Not a member");

  await db.transaction(async (tx) => {
    await tx
      .update(memberships)
      .set({ role: "owner" })
      .where(
        and(
          eq(memberships.projectId, parsed.data.projectId),
          eq(memberships.userId, parsed.data.userId),
        ),
      );
    await tx
      .update(memberships)
      .set({ role: "admin" })
      .where(
        and(
          eq(memberships.projectId, parsed.data.projectId),
          eq(memberships.userId, actorCtx.userId),
        ),
      );
    await tx
      .update(projects)
      .set({ ownerId: parsed.data.userId })
      .where(eq(projects.id, parsed.data.projectId));
  });

  await db.insert(activities).values({
    projectId: parsed.data.projectId,
    actorId: actorCtx.userId,
    entityType: "membership",
    entityId: parsed.data.userId,
    verb: "ownership-transferred",
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
