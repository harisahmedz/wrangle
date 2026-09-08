"use client";

import { useEffect, useState, useTransition } from "react";
import { createInvite } from "@/lib/actions/invites";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { InviteableRole } from "@/lib/sharing/permissions";

const ROLE_OPTIONS: Array<{ value: InviteableRole; label: string; hint: string }> = [
  { value: "viewer", label: "Viewer", hint: "Read-only" },
  { value: "member", label: "Member", hint: "Edit cards" },
  { value: "admin", label: "Admin", hint: "Manage columns and invites" },
];

type CopyState = "idle" | "copied" | "failed";

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
  const [copy, setCopy] = useState<CopyState>("idle");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (copy !== "copied") return;
    const t = setTimeout(() => setCopy("idle"), 2000);
    return () => clearTimeout(t);
  }, [copy]);

  const close = () => {
    setLink(null);
    setError(null);
    setCopy("idle");
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

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
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
            Shown once, so copy it now. It grants{" "}
            <span className="font-medium text-text">{role}</span> access.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              aria-label="Invite link"
              className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 font-mono text-sm"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button onClick={() => void copyLink()}>
              {copy === "copied" ? "Copied" : "Copy"}
            </Button>
          </div>
          <p role="status" className={cn("text-xs", copy === "failed" ? "text-danger" : "text-muted")}>
            {copy === "copied" && "Link copied to your clipboard."}
            {copy === "failed" && "Couldn't copy automatically. Tap the link, select all, and copy."}
          </p>
          <Button variant="secondary" className="w-full" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Invite to project</h2>

          <div>
            <p className="mb-1.5 text-sm font-medium">Role</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {roles.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  aria-pressed={role === r.value}
                  className={cn(
                    "min-h-11 rounded-lg border p-3 text-left transition-colors",
                    role === r.value
                      ? "border-accent bg-accent/10"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block text-xs text-muted">{r.hint}</span>
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
                className="h-11 w-full rounded-md border border-border bg-surface-2 px-2 text-sm"
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
                className="h-11 w-full rounded-md border border-border bg-surface-2 px-2 text-sm"
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
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={create} disabled={pending}>
              {pending ? "Creating…" : "Create link"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
