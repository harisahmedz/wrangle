"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { BoardKind } from "@/db/schema";

const TABS: Array<{ kind: BoardKind; label: string }> = [
  { kind: "todo", label: "To-Do" },
  { kind: "ideas", label: "Ideas" },
  { kind: "work", label: "Work" },
];

export function BoardTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: BoardKind;
}) {
  return (
    <div
      role="tablist"
      aria-label="Board switcher"
      className="inline-flex rounded-lg border border-border bg-surface p-1"
    >
      {TABS.map(({ kind, label }) => (
        <Link
          key={kind}
          role="tab"
          aria-selected={active === kind}
          href={`/p/${projectId}/b/${kind}`}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            active === kind
              ? "bg-accent text-accent-fg"
              : "text-muted hover:text-text",
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
