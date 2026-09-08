import type { Metadata } from "next";
import { requireMembership } from "@/lib/authz";
import { describeEntry, projectFeed } from "@/lib/kanban/activity";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

type Props = { params: Promise<{ projectId: string }> };

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ params }: Props) {
  const { projectId } = await params;
  await requireMembership(projectId);
  const feed = await projectFeed(projectId, 60);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity"
        back={{ href: `/p/${projectId}`, label: "Back to board" }}
      />

      {feed.length === 0 ? (
        <EmptyState
          icon="🕒"
          title="Nothing has happened yet"
          description="Move a card, tick a checklist item or leave a comment and it shows up here."
        />
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
