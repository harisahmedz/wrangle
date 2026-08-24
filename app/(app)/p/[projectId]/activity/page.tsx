import type { Metadata } from "next";
import Link from "next/link";
import { requireMembership } from "@/lib/authz";
import { describeEntry, projectFeed } from "@/lib/kanban/activity";

type Props = { params: Promise<{ projectId: string }> };

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ params }: Props) {
  const { projectId } = await params;
  await requireMembership(projectId);
  const feed = await projectFeed(projectId, 60);

  return (
    <div className="space-y-5">
      <Link href={`/p/${projectId}/b/todo`} className="text-sm text-muted hover:text-text">
        ← Back to board
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Activity</h1>

      {feed.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted">
          Nothing has happened yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {feed.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-2"
            >
              <span>{describeEntry(e)}</span>
              <span className="shrink-0 text-xs text-muted">
                {e.createdAt.toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
