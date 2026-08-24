"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/ui/dialog";
import {
  NewProjectDialog,
} from "@/components/projects/new-project-dialog";
import type { SidebarProject } from "@/components/app/side-projects";

export function MobileProjectsDrawer({
  projects,
}: {
  projects: SidebarProject[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const visible = projects.filter((p) => !p.archivedAt);
  const archived = projects.filter((p) => p.archivedAt);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open projects"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text md:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label="Projects">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Projects
        </h2>
        <nav className="flex flex-col gap-0.5">
          {visible.map((p) => {
            const active =
              pathname === `/p/${p.id}` || pathname.startsWith(`/p/${p.id}/`);
            return (
              <Link
                key={p.id}
                href={`/p/${p.id}`}
                onClick={() => setOpen(false)}
                className={
                  "flex items-center gap-2.5 rounded-md px-2 py-2.5 text-sm " +
                  (active
                    ? "bg-surface-2 font-medium text-text"
                    : "text-muted hover:bg-surface-2 hover:text-text")
                }
              >
                <span aria-hidden className="text-base">{p.emoji ?? "📁"}</span>
                <span className="truncate">{p.name}</span>
                {p.archivedAt && (
                  <span className="ml-auto text-[10px] uppercase text-muted">archived</span>
                )}
              </Link>
            );
          })}
        </nav>

        {archived.length > 0 && (
          <>
            <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
              Archived
            </h3>
            <nav className="flex flex-col gap-0.5 opacity-70">
              {archived.map((p) => (
                <Link
                  key={p.id}
                  href={`/p/${p.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-md px-2 py-2.5 text-sm text-muted"
                >
                  <span aria-hidden>{p.emoji ?? "📁"}</span>
                  <span className="truncate">{p.name}</span>
                </Link>
              ))}
            </nav>
          </>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
          <Link href="/trash" onClick={() => setOpen(false)} className="text-muted">
            Trash
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              setDialogOpen(true);
            }}
            className="font-medium text-accent-strong"
          >
            + New project
          </button>
        </div>
      </Sheet>

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
