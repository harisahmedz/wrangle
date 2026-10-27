"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/dialog";
import { ProjectNav, type SidebarProject } from "@/components/app/project-nav";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { LinesIcon } from "@/components/icons";

export function MobileProjectsDrawer({
  projects,
}: {
  projects: SidebarProject[];
}) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open projects"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text md:hidden"
      >
        <LinesIcon className="h-5 w-5" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label="Projects">
        <ProjectNav
          projects={projects}
          onNavigate={() => setOpen(false)}
          onRequestNewProject={() => {
            setOpen(false);
            setDialogOpen(true);
          }}
        />
      </Sheet>

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
