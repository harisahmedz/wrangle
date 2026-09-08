"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";

export function LeaveProjectButton({
  projectId,
  action,
}: {
  projectId: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Leave project…
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} label="Leave project">
        <h3 className="mb-2 text-lg font-semibold">Leave this project?</h3>
        <p className="mb-4 text-sm text-muted">
          You lose access immediately. An admin can invite you back later.
        </p>
        <form action={action} className="flex justify-end gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="danger">
            Leave project
          </Button>
        </form>
      </Modal>
    </>
  );
}
