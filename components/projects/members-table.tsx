"use client";

import { useTransition } from "react";
import { changeMemberRole, removeMember, transferOwnership } from "@/lib/actions/invites";
import { canChangeRole, canRemoveMember, ROLE_RANK } from "@/lib/sharing/permissions";
import type { ProjectRole } from "@/db/schema";

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
  const [, startTransition] = useTransition();

  const run = (fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData) => {
    startTransition(async () => {
      await fn(fd);
    });
  };

  return (
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
              onClick={() => {
                if (!confirm(`Remove ${m.name ?? "this member"}?`)) return;
                const fd = new FormData();
                fd.set("projectId", projectId);
                fd.set("userId", m.userId);
                run(removeMember, fd);
              }}
              aria-label={`Remove ${m.name ?? "member"}`}
              className="text-sm text-muted transition-colors hover:text-danger"
            >
              Remove
            </button>
          )}

          {myRole === "owner" && !m.isYou && (
            <button
              onClick={() => {
                if (!confirm(`Transfer ownership to ${m.name ?? "this member"}? You become admin.`)) return;
                const fd = new FormData();
                fd.set("projectId", projectId);
                fd.set("userId", m.userId);
                run(transferOwnership, fd);
              }}
              className="text-xs text-muted hover:text-text"
            >
              Make owner
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
