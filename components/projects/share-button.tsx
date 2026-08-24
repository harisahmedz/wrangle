"use client";

import { useState } from "react";
import { ShareDialog } from "@/components/projects/share-dialog";

export function ShareButton({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
      >
        Invite
      </button>
      <ShareDialog
        projectId={projectId}
        isOwner={isOwner}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
