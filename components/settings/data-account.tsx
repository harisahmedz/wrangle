"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/lib/actions/settings";
import { Button, buttonStyles } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";

const EXPORTS = [
  { href: "/api/export", label: "Everything (JSON)" },
  { href: "/api/export?format=cards.csv", label: "Cards (CSV)" },
  { href: "/api/export?format=expenses.csv", label: "Expenses (CSV)" },
  { href: "/api/export?format=learning.csv", label: "Learning (CSV)" },
  { href: "/api/export?format=reviews.csv", label: "Day reviews (CSV)" },
];

export function DataAndAccount() {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    const formData = new FormData();
    formData.set("confirmation", confirmation);
    startTransition(async () => {
      navigator.serviceWorker?.controller?.postMessage({
        type: "CLEAR_PRIVATE_CACHES",
      });
      const result = await deleteAccount(formData);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <>
      <section>
        <h2 className="mb-3 font-semibold">Export your data</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-4 text-sm text-muted">
            Download a complete JSON archive or a spreadsheet-friendly CSV for
            each personal module.
          </p>
          <div className="flex flex-wrap gap-2">
            {EXPORTS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                download
                className={buttonStyles({ variant: "secondary" })}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-danger">Danger zone</h2>
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-danger/30 bg-danger/5 p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium">Delete account</p>
            <p className="mt-1 text-sm text-muted">
              Permanently deletes your account and owned workspaces. Export your
              data first—this cannot be undone.
            </p>
          </div>
          <Button
            type="button"
            variant="danger"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => setConfirming(true)}
          >
            Delete account…
          </Button>
        </div>
      </section>

      <Modal
        open={confirming}
        onClose={() => {
          if (pending) return;
          setConfirming(false);
          setConfirmation("");
          setError(null);
        }}
        label="Delete account"
      >
        <h3 className="text-lg font-semibold">Permanently delete your account?</h3>
        <p className="mt-2 text-sm text-muted">
          Your owned workspaces, personal data, and uploads will be removed. Shared
          workspaces owned by someone else will stay. Type{" "}
          <span className="font-mono text-text">DELETE</span> to confirm.
        </p>
        <input
          autoFocus
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value);
            setError(null);
          }}
          aria-label="Type DELETE to confirm"
          placeholder="DELETE"
          className="mt-4 h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm outline-none focus:border-accent"
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirming(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={remove}
            disabled={pending || confirmation !== "DELETE"}
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
