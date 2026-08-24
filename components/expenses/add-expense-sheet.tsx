"use client";

import { useRef, useState, useTransition } from "react";
import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  addExpense,
  deleteExpense,
  restoreExpense,
  updateExpense,
} from "@/lib/actions/expenses";
import type { CategoryChip } from "@/components/expenses/types";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

export function ExpenseSheet({
  open,
  onClose,
  categories,
  cloudinaryReady,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryChip[];
  cloudinaryReady: boolean;
  editing?: {
    id: string;
    amountMinor: number;
    categoryId: string;
    spentOn: string;
    note: string | null;
  } | null;
}) {
  const pushToast = useToast();
  const [raw, setRaw] = useState(
    editing ? (editing.amountMinor / 100).toFixed(2) : "",
  );
  const [categoryId, setCategoryId] = useState(
    editing?.categoryId ?? categories[0]?.id ?? "",
  );
  const [spentOn, setSpentOn] = useState(editing?.spentOn ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [receipt, setReceipt] = useState<{ publicId: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    if (!editing) {
      setRaw("");
      setNote("");
      setReceipt(null);
    }
    onClose();
  };

  const press = (k: string) => {
    if (k === "⌫") {
      setRaw((v) => v.slice(0, -1));
      return;
    }
    if (k === ".") {
      setRaw((v) => (v.includes(".") ? v : v === "" ? "0." : `${v}.`));
      return;
    }
    const [, frac] = raw.split(".");
    if (frac && frac.length >= 2) return;
    setRaw((v) => (v === "0" ? k : v + k));
  };

  const minorValue = (() => {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  })();

  const pickFile = async (file: File) => {
    if (!cloudinaryReady) {
      pushToast({ message: "Add Cloudinary keys for receipts" });
      return;
    }
    setUploading(true);
    try {
      const { prepareReceipt } = await import("@/lib/client/receipt");
      const prepared = await prepareReceipt(file);

      const { signReceiptUpload } = await import("@/lib/actions/expenses");
      const fd = new FormData();
      fd.set("mime", prepared.mime);
      fd.set("bytes", String(prepared.file.size));
      const sig = await signReceiptUpload(fd);
      if (!sig.ok) {
        pushToast({ message: sig.error });
        return;
      }

      const form = new FormData();
      form.set("file", prepared.file);
      form.set("api_key", sig.data.apiKey);
      form.set("timestamp", String(sig.data.timestamp));
      form.set("signature", sig.data.signature);
      form.set("public_id", sig.data.publicId);
      form.set("folder", sig.data.folder);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.data.cloudName}/auto/upload`,
        { method: "POST", body: form },
      );
      if (!res.ok) {
        pushToast({ message: "Upload failed" });
        return;
      }
      setReceipt({
        publicId: sig.data.publicId,
        name: file.name,
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = () => {
    if (!minorValue || !categoryId || !spentOn) return;
    const fd = new FormData();
    fd.set("amountMinor", String(minorValue));
    fd.set("categoryId", categoryId);
    fd.set("spentOn", spentOn);
    fd.set("note", note);
    if (editing) {
      fd.set("expenseId", editing.id);
      startTransition(async () => {
        const res = await updateExpense(fd);
        if (!res.ok) pushToast({ message: res.error });
      });
    } else {
      fd.set("receiptPublicId", receipt?.publicId ?? "");
      startTransition(async () => {
        await addExpense(fd);
      });
    }
    close();
  };

  const remove = () => {
    if (!editing) return;
    const fd = new FormData();
    fd.set("expenseId", editing.id);
    startTransition(async () => {
      const res = await deleteExpense(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      pushToast({
        message: "Deleted",
        actionLabel: "Undo",
        onAction: () => {
          const undoFd = new FormData();
          undoFd.set("expenseId", editing.id);
          void restoreExpense(undoFd);
        },
      });
    });
    close();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      label={editing ? "Edit expense" : "Add expense"}
    >
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-4xl font-bold tabular-nums" aria-live="polite">
            {raw === "" ? "$0.00" : `$${raw}`}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-12 rounded-lg bg-surface-2 text-lg font-medium transition-colors hover:bg-surface active:bg-accent/20"
            >
              {k}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryId(c.id)}
              aria-pressed={categoryId === c.id}
              style={
                categoryId === c.id
                  ? { backgroundColor: `${c.color ?? "#8b5cf6"}22`, borderColor: c.color ?? "#8b5cf6" }
                  : undefined
              }
              className={
                "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                (categoryId === c.id ? "text-text" : "border-border text-muted")
              }
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="date"
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
            aria-label="Date"
            className="h-10 flex-1 rounded-md border border-border bg-surface-2 px-2 text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note…"
            maxLength={500}
            aria-label="Note"
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm"
          />
        </div>

        {!editing && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
              }}
              className="hidden"
              id="receipt-file"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-md border border-dashed border-border py-2.5 text-sm text-muted hover:text-text disabled:opacity-50"
            >
              {uploading
                ? "Uploading receipt…"
                : receipt
                  ? `📎 ${receipt.name}`
                  : cloudinaryReady
                    ? "📎 Attach receipt (optional)"
                    : "📎 Receipts need Cloudinary keys"}
            </button>
          </>
        )}

        <div className="flex items-center justify-between pt-1">
          {editing ? (
            <button
              onClick={remove}
              className="text-sm text-danger hover:underline"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={close} className="px-3 py-2 text-sm text-muted hover:text-text">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!minorValue || !categoryId || !spentOn}
              className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {editing ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
