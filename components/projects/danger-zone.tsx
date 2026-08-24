"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteToTrash, restoreFromTrash, setArchived } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function DangerZone({
  projectId,
  projectName,
  isPersonal,
  isArchived,
}: {
  projectId: string;
  projectName: string;
  isPersonal: boolean;
  isArchived: boolean;
}) {
  const router = useRouter();
  const pushToast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const archive = (archived: boolean) => {
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("archived", String(archived));
    startTransition(async () => {
      const res = await setArchived(fd);
      if (!res.ok) pushToast({ message: res.error });
    });
  };

  const remove = () => {
    const fd = new FormData();
    fd.set("projectId", projectId);
    startTransition(async () => {
      const res = await deleteToTrash(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      setConfirmingDelete(false);
      router.push("/today");
      pushToast({
        message: `${projectName} moved to trash`,
        actionLabel: "Undo",
        onAction: () => {
          const undo = new FormData();
          undo.set("projectId", projectId);
          void restoreFromTrash(undo);
        },
      });
    });
  };

  return (
    <section className="space-y-4 rounded-xl border border-danger/30 bg-danger/5 p-5">
      <h2 className="font-semibold text-danger">Danger zone</h2>

      {!isPersonal && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {isArchived ? "Unarchive project" : "Archive project"}
            </p>
            <p className="text-sm text-muted">
              Hidden from the sidebar without losing any data.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => archive(!isArchived)}
            disabled={pending}
          >
            {isArchived ? "Unarchive" : "Archive"}
          </Button>
        </div>
      )}

      {!isPersonal && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-danger/20 pt-4">
          <div>
            <p className="text-sm font-medium">Delete project</p>
            <p className="text-sm text-muted">
              Moves it to trash. Restorable for 30 days.
            </p>
          </div>
          <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
            Delete…
          </Button>
        </div>
      )}

      {isPersonal && (
        <p className="text-sm text-muted">
          My Space is your home base — it can be renamed but never archived or
          deleted.
        </p>
      )}

      <Modal
        open={confirmingDelete}
        onClose={() => {
          setConfirmingDelete(false);
          setConfirmText("");
        }}
        label={`Delete ${projectName}`}
      >
        <h3 className="mb-2 text-lg font-semibold">Delete {projectName}?</h3>
        <p className="mb-4 text-sm text-muted">
          It goes to trash and can be restored for 30 days. Type{" "}
          <span className="font-mono text-text">DELETE</span> to confirm.
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mb-4 h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
          placeholder="DELETE"
          aria-label="Type DELETE to confirm"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={remove}
            disabled={pending || confirmText !== "DELETE"}
          >
            {pending ? "Deleting…" : "Move to trash"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
