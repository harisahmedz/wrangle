"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
      <Button onClick={() => setOpen(true)}>Invite</Button>
      <ShareDialog
        projectId={projectId}
        isOwner={isOwner}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
