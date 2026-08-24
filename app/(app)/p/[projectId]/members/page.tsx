import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { requireMembership } from "@/lib/authz";
import { canInvite, canLeave } from "@/lib/sharing/permissions";
import { listProjectInvites, revokeInvite } from "@/lib/actions/invites";
import { leaveProject } from "@/lib/actions/projects-members";
import { ShareButton } from "@/components/projects/share-button";
import { MembersTable } from "@/components/projects/members-table";

type Props = { params: Promise<{ projectId: string }> };

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: Props) {
  const { projectId } = await params;
  const ctx = await requireMembership(projectId);

  const memberRows = await db
    .select({
      userId: memberships.userId,
      role: memberships.role,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.projectId, projectId))
    .orderBy(asc(memberships.joinedAt));

  const invites = canInvite(ctx.role)
    ? await listProjectInvites(projectId)
    : [];

  async function revoke(fd: FormData) {
    "use server";
    await revokeInvite(fd);
  }

  async function leave(fd: FormData) {
    "use server";
    await leaveProject(fd);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/p/${projectId}`} className="text-sm text-muted hover:text-text">
          ← Back to board
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          {canInvite(ctx.role) && (
            <ShareButton projectId={projectId} isOwner={ctx.role === "owner"} />
          )}
        </div>
      </div>

      <MembersTable
        projectId={projectId}
        myRole={ctx.role}
        members={memberRows.map((m) => ({
          userId: m.userId,
          name: m.name,
          email: m.email,
          image: m.image,
          role: m.role,
          isYou: m.userId === ctx.userId,
        }))}
      />

      {canLeave(ctx.role) && (
        <form action={leave}>
          <input type="hidden" name="projectId" value={projectId} />
          <button
            type="submit"
            className="rounded-md border border-danger/30 px-3 py-2 text-sm text-danger transition-colors hover:bg-danger hover:text-white"
          >
            Leave project
          </button>
        </form>
      )}

      {invites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Active invites
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {invites.map((inv) => {
              const expired = inv.isExpired;
              return (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] capitalize text-muted">
                    {inv.role}
                  </span>
                  <span className={expired ? "text-danger" : "text-muted"}>
                    {expired
                      ? "Expired"
                      : `Expires ${inv.expiresAt.toLocaleDateString()}`}
                  </span>
                  <span className="text-xs text-muted">
                    {inv.usedCount}/{inv.maxUses} used
                  </span>
                  {!expired && (
                    <form action={revoke}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="inviteId" value={inv.id} />
                      <button
                        type="submit"
                        className="text-xs text-muted transition-colors hover:text-danger"
                      >
                        Revoke
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
