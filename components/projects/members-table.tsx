"use client";

import { useState, useTransition } from "react";
import { changeMemberRole, removeMember, transferOwnership } from "@/lib/actions/invites";
import { canChangeRole, canRemoveMember, ROLE_RANK } from "@/lib/sharing/permissions";
import type { ProjectRole } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export type MemberRowData = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: ProjectRole;
  isYou: boolean;
};

export function MembersTable({
  projectId,
  members,
  myRole,
}: {
  projectId: string;
  members: MemberRowData[];
  myRole: ProjectRole;
}) {
  const pushToast = useToast();
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<MemberRowData | null>(null);
  const [transferring, setTransferring] = useState<MemberRowData | null>(null);

  const run = (fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData) => {
    startTransition(async () => {
      await fn(fd);
    });
  };

  const confirmRemove = () => {
    if (!removing) return;
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("userId", removing.userId);
    startTransition(async () => {
      const res = await removeMember(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      setRemoving(null);
    });
  };

  const confirmTransfer = () => {
    if (!transferring) return;
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("userId", transferring.userId);
    startTransition(async () => {
      const res = await transferOwnership(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      setTransferring(null);
    });
  };

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-xs font-semibold">
              {m.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="" className="h-full w-full object-cover" />
              ) : (
                (m.name ?? m.email).charAt(0).toUpperCase()
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {m.name ?? "Member"}
                {m.isYou && <span className="ml-1.5 text-xs text-muted">(you)</span>}
              </p>
              <p className="truncate text-xs text-muted">{m.email}</p>
            </div>

            {myRole === "owner" || (ROLE_RANK[myRole] >= 2 && ROLE_RANK[m.role] < ROLE_RANK[myRole]) ? (
              <select
                value={m.role}
                disabled={m.role === "owner" || !canChangeRole(myRole, m.role, "viewer") && m.role !== "viewer"}
                onChange={(e) => {
                  const fd = new FormData();
                  fd.set("projectId", projectId);
                  fd.set("userId", m.userId);
                  fd.set("role", e.target.value);
                  run(changeMemberRole, fd);
                }}
                aria-label={`Role for ${m.name ?? "member"}`}
                className="h-8 rounded-md border border-border bg-surface-2 px-1.5 text-xs"
              >
                {(["viewer", "member", "admin", "owner"] as ProjectRole[]).map((r) => (
                  <option key={r} value={r} disabled={r === "owner"}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] capitalize text-muted">
                {m.role}
              </span>
            )}

            {!m.isYou && canRemoveMember(myRole, m.role) && (
              <button
                onClick={() => setRemoving(m)}
                aria-label={`Remove ${m.name ?? "member"}`}
                className="text-sm text-muted transition-colors hover:text-danger"
              >
                Remove
              </button>
            )}

            {myRole === "owner" && !m.isYou && (
              <button
                onClick={() => setTransferring(m)}
                className="text-xs text-muted hover:text-text"
              >
                Make owner
              </button>
            )}
          </li>
        ))}
      </ul>

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        label={`Remove ${removing?.name ?? "member"}`}
      >
        <h3 className="mb-2 text-lg font-semibold">
          Remove {removing?.name ?? "this member"}?
        </h3>
        <p className="mb-4 text-sm text-muted">
          They lose access to this project immediately.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmRemove} disabled={pending}>
            {pending ? "Removing…" : "Remove member"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={transferring !== null}
        onClose={() => setTransferring(null)}
        label={`Transfer ownership to ${transferring?.name ?? "member"}`}
      >
        <h3 className="mb-2 text-lg font-semibold">
          Transfer ownership to {transferring?.name ?? "this member"}?
        </h3>
        <p className="mb-4 text-sm text-muted">
          You become admin and they get full control of the project.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setTransferring(null)}>
            Cancel
          </Button>
          <Button onClick={confirmTransfer} disabled={pending}>
            {pending ? "Transferring…" : "Transfer ownership"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
