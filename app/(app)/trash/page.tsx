import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships, projects } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { purgeProject, restoreFromTrash } from "@/lib/actions/projects";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Trash" };

const TRASH_RETENTION_DAYS = 30;

export default async function TrashPage() {
  const userId = await requireUser();

  const trashed = await db
    .select({
      id: projects.id,
      name: projects.name,
      emoji: projects.emoji,
      daysLeft: sql<number>`greatest(0, ${TRASH_RETENTION_DAYS} - extract(day from now() - ${projects.deletedAt})::int)`,
    })
    .from(memberships)
    .innerJoin(projects, eq(memberships.projectId, projects.id))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.role, "owner"),
        isNotNull(projects.deletedAt),
      ),
    )
    .orderBy(desc(projects.deletedAt));

  async function restore(formData: FormData) {
    "use server";
    await restoreFromTrash(formData);
  }

  async function purge(formData: FormData) {
    "use server";
    const res = await purgeProject(formData);
    if (!res.ok) redirect("/trash");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trash</h1>
        <p className="mt-1 text-sm text-muted">
          Deleted projects restorable for {TRASH_RETENTION_DAYS} days.
        </p>
      </div>

      {trashed.length === 0 ? (
        <EmptyState icon="🗑️" title="Trash is empty" />
      ) : (
        <ul className="space-y-3">
          {trashed.map((p) => {
            const daysLeft = p.daysLeft;
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <span className="text-xl opacity-70">{p.emoji ?? "📁"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted">
                    {daysLeft} day{daysLeft === 1 ? "" : "s"} until permanent
                    deletion
                  </p>
                </div>
                <form action={restore}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-surface-2"
                  >
                    Restore
                  </button>
                </form>
                <form action={purge}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-danger/30 px-3 py-2 text-sm text-danger transition-colors hover:bg-danger hover:text-white"
                  >
                    Delete forever
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
