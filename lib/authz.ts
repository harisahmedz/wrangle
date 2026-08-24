import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
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

export async function requireMembership(
  projectId: string,
  minRole: ProjectRole = "viewer",
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
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !hasMinRole(row.role, minRole)) notFound();

  return { userId, projectId, role: row.role };
}
