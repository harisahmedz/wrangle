import type { Metadata } from "next";
import Link from "next/link";
import { requireMembership } from "@/lib/authz";
import { searchProjectCards } from "@/lib/kanban/search";
import { EmptyState } from "@/components/ui/empty-state";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ q?: string }>;
};

export const metadata: Metadata = { title: "Search" };

export default async function ProjectSearchPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  await requireMembership(projectId);
  const q = ((await searchParams).q ?? "").slice(0, 200);
  const hits = q ? await searchProjectCards(projectId, q) : [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Search</h1>
      <form action={`/p/${projectId}/search`} className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search cards in this project…"
          aria-label="Search cards"
          className="h-10 flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm"
          autoFocus
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Search
        </button>
      </form>

      {q && hits.length === 0 && (
        <EmptyState icon="🔍" title={`No matches for “${q}”`} />
      )}

      {hits.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {hits.map((hit) => (
            <li key={hit.id}>
              <Link
                href={`/p/${projectId}/b/${hit.kind}?card=${hit.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-surface-2"
              >
                <span className="truncate">{hit.title}</span>
                <span className="ml-3 shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  {hit.kind}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
