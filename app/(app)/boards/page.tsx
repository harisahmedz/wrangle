import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { db } from "@/db";
import { memberships, projects } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Boards" };

export default async function BoardsPage() {
  const userId = await requireUser();

  const myProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      emoji: projects.emoji,
      color: projects.color,
      isPersonal: projects.isPersonal,
    })
    .from(memberships)
    .innerJoin(projects, eq(memberships.projectId, projects.id))
    .where(and(eq(memberships.userId, userId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.position));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Boards</h1>
      <p className="text-sm text-muted">
        To-Do / Ideas / Work boards per project land in Phase 2. Your projects:
      </p>
      {myProjects.length === 0 ? (
        <EmptyState icon="🗂️" title="No projects yet" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {myProjects.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-muted/40"
            >
              <Link href={`/p/${p.id}/b/todo`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="text-xl">{p.emoji ?? "📁"}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.isPersonal ? "Personal space" : "Shared project"} · To-Do / Ideas / Work
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
