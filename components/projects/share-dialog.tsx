"use client";

import { useState, useTransition } from "react";
import { createInvite } from "@/lib/actions/invites";
import { Modal } from "@/components/ui/dialog";
import type { InviteableRole } from "@/lib/sharing/permissions";

const ROLE_OPTIONS: Array<{ value: InviteableRole; label: string; hint: string }> = [
  { value: "viewer", label: "Viewer", hint: "Read-only" },
  { value: "member", label: "Member", hint: "Edit cards" },
  { value: "admin", label: "Admin", hint: "Manage columns, invites" },
];

export function ShareDialog({
  projectId,
  isOwner,
  open,
  onClose,
}: {
  projectId: string;
  isOwner: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [role, setRole] = useState<InviteableRole>("member");
  const [expiry, setExpiry] = useState(7);
  const [maxUses, setMaxUses] = useState(10);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  const close = () => {
    setLink(null);
    setError(null);
    setCopied(false);
    onClose();
  };

  const create = () => {
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("role", role);
    fd.set("expiresInDays", String(expiry));
    fd.set("maxUses", String(maxUses));
    startTransition(async () => {
      const res = await createInvite(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLink(`${window.location.origin}/join/${res.data.token}`);
    });
  };

  const roles = ROLE_OPTIONS.filter(
    (r) => r.value !== "admin" || isOwner,
  );

  return (
    <Modal open={open} onClose={close} label="Share project">
      {link ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Invite link ready</h2>
          <p className="text-sm text-muted">
            Shown once — copy it now. It grants{" "}
            <span className="font-medium text-text">{role}</span> access.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              aria-label="Invite link"
              className="h-10 flex-1 rounded-md border border-border bg-surface-2 px-3 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link!);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={close}
            className="w-full rounded-md border border-border py-2.5 text-sm text-muted hover:text-text"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Invite to project</h2>

          <div>
            <p className="mb-1.5 text-sm font-medium">Role</p>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  aria-pressed={role === r.value}
                  title={r.hint}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                    (role === r.value
                      ? "border-accent bg-accent/15 text-text"
                      : "border-border text-muted hover:text-text")
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex-1 space-y-1">
              <span className="block text-sm font-medium">Expires</span>
              <select
                value={expiry}
                onChange={(e) => setExpiry(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-border bg-surface-2 px-2 text-sm"
              >
                <option value={1}>In 1 day</option>
                <option value={7}>In 7 days</option>
                <option value={30}>In 30 days</option>
              </select>
            </label>
            <label className="flex-1 space-y-1">
              <span className="block text-sm font-medium">Max uses</span>
              <select
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-border bg-surface-2 px-2 text-sm"
              >
                {[1, 5, 10, 25].map((n) => (
                  <option key={n} value={n}>
                    {n} use{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={close}
              className="rounded-md px-3 py-2 text-sm text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              onClick={create}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
            >
              Create link
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
