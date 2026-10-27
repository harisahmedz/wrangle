import type { Metadata } from "next";
import Link from "next/link";
import { requireMembership } from "@/lib/authz";
import { searchProjectCards } from "@/lib/kanban/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ q?: string }>;
};

export const metadata: Metadata = { title: "Search" };

const KIND_LABEL: Record<string, string> = { todo: "To-Do", ideas: "Ideas", work: "Work" };

export default async function ProjectSearchPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  await requireMembership(projectId);
  const q = ((await searchParams).q ?? "").slice(0, 200);
  const hits = q ? await searchProjectCards(projectId, q) : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Search" />
      <form action={`/p/${projectId}/search`} className="flex gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search cards in this project…"
          aria-label="Search cards"
          className="flex-1"
        />
        <Button type="submit">Search</Button>
      </form>

      {!q && (
        <EmptyState
          icon="🔍"
          title="Search this project"
          description="Find cards by title across the To-Do, Ideas and Work boards."
        />
      )}

      {q && hits.length === 0 && (
        <EmptyState
          icon="🔍"
          title={`No matches for “${q}”`}
          description="Try a shorter word, or check that the card isn't in the trash."
        />
      )}

      {hits.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {hits.map((hit) => (
            <li key={hit.id}>
              <Link
                href={`/p/${projectId}/b/${hit.kind}?card=${hit.id}`}
                className="flex min-h-11 items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-surface-2"
              >
                <span className="truncate">{hit.title}</span>
                <span className="ml-3 shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted">
                  {KIND_LABEL[hit.kind] ?? hit.kind}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
