import { notFound, redirect } from "next/navigation";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { memberships, projects } from "@/db/schema";
import type { ProjectRole } from "@/db/schema";

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function hasMinRole(role: ProjectRole, minRole: ProjectRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export type MembershipContext = {
  userId: string;
  projectId: string;
  role: ProjectRole;
};

export async function requireUser(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");
  return userId;
}

/**
 * The user's role on a live (not soft-deleted) project, or null. The
 * non-redirecting half of `requireMembership` — the outbox apply layer
 * (`lib/outbox/apply.ts`) needs a plain answer per entry, since a
 * `notFound()`/`redirect()` inside `POST /api/outbox` would abort the whole
 * batch instead of failing one entry.
 */
export async function membershipRole(
  userId: string,
  projectId: string,
): Promise<ProjectRole | null> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .innerJoin(projects, eq(memberships.projectId, projects.id))
    .where(
      and(
        eq(memberships.projectId, projectId),
        eq(memberships.userId, userId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return rows[0]?.role ?? null;
}

export async function requireMembership(
  projectId: string,
  minRole: ProjectRole = "viewer",
): Promise<MembershipContext> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");

  const role = await membershipRole(userId, projectId);
  if (!role || !hasMinRole(role, minRole)) notFound();

  return { userId, projectId, role };
}

/**
 * Owner check for a project that IS in the Trash (soft-deleted). Only
 * restoreFromTrash/purgeProject use this; every other caller goes through
 * `requireMembership`, which keeps rejecting trashed projects.
 */
export async function requireTrashedProjectOwner(
  projectId: string,
): Promise<MembershipContext> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");

  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .innerJoin(projects, eq(memberships.projectId, projects.id))
    .where(
      and(
        eq(memberships.projectId, projectId),
        eq(memberships.userId, userId),
        eq(memberships.role, "owner"),
        isNotNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (!rows[0]) notFound();

  return { userId, projectId, role: "owner" };
}
