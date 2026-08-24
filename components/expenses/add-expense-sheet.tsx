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

type ReceiptUpload = {
  publicId: string;
  url: string;
  name: string;
  isPdf: boolean;
};

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
    receiptUrl: string | null;
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
  const [paymentMethod, setPaymentMethod] = useState("");
  const [receipt, setReceipt] = useState<ReceiptUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [receiptRemoved, setReceiptRemoved] = useState(false);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const storedReceipt =
    editing && editing.receiptUrl && !receiptRemoved
      ? {
          url: editing.receiptUrl,
          name: "Receipt",
          isPdf: editing.receiptUrl.includes("/raw/upload/"),
        }
      : null;
  const activeReceipt: Omit<ReceiptUpload, "publicId"> | null = receipt ?? storedReceipt;

  const close = () => {
    if (!editing) {
      setRaw("");
      setNote("");
      setReceipt(null);
    }
    setUploadError(null);
    setReceiptRemoved(false);
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
      setUploadError("Receipts need Cloudinary keys — add them in settings first.");
      return;
    }
    setUploadError(null);
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
        setUploadError(`${sig.error} Try a smaller image or PDF.`);
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
        setUploadError("Upload failed — check your connection and try again.");
        return;
      }
      const isPdf = prepared.mime === "application/pdf";
      setReceipt({
        publicId: sig.data.publicId,
        url: isPdf
          ? `https://res.cloudinary.com/${sig.data.cloudName}/raw/upload/${sig.data.publicId}`
          : `https://res.cloudinary.com/${sig.data.cloudName}/image/upload/f_auto,q_auto/${sig.data.publicId}`,
        name: file.name,
        isPdf,
      });
    } catch {
      setUploadError("Couldn't upload that file — try again.");
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
    fd.set("paymentMethod", paymentMethod);
    if (editing) {
      fd.set("expenseId", editing.id);
      if (receiptRemoved) {
        fd.set("receiptPublicId", "");
        fd.set("receiptUrl", "");
      } else if (receipt) {
        fd.set("receiptPublicId", receipt.publicId);
        fd.set("receiptUrl", receipt.url);
      }
      startTransition(async () => {
        const res = await updateExpense(fd);
        if (!res.ok) pushToast({ message: res.error });
      });
    } else {
      fd.set("receiptPublicId", receipt?.publicId ?? "");
      fd.set("receiptUrl", receipt?.url ?? "");
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
        <input
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          placeholder="Paid with… (cash, card, wallet — optional)"
          maxLength={40}
          aria-label="Payment method"
          className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-xs"
        />

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

        {uploadError && <p className="text-sm text-danger">{uploadError}</p>}

        {uploading ? (
          <div
            role="status"
            className="flex h-11 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted"
          >
            Uploading receipt…
          </div>
        ) : activeReceipt ? (
          <div className="space-y-2">
            {activeReceipt.isPdf ? (
              <a
                href={activeReceipt.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-surface-2"
              >
                📎 <span className="truncate">{activeReceipt.name}</span>
              </a>
            ) : (
              <a
                href={activeReceipt.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeReceipt.url}
                  alt={activeReceipt.name}
                  className="max-h-40 w-full rounded-md border border-border object-contain"
                />
              </a>
            )}
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setReceiptRemoved(false);
                  fileRef.current?.click();
                }}
                className="px-1 py-2 text-sm text-muted hover:text-text"
              >
                Replace
              </button>
              <button
                onClick={() => {
                  setReceipt(null);
                  setReceiptRemoved(true);
                }}
                className="px-1 py-2 text-sm text-danger hover:underline"
              >
                Remove receipt
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!cloudinaryReady}
            className="w-full rounded-md border border-dashed border-border py-2.5 text-sm text-muted hover:text-text disabled:opacity-50"
          >
            {cloudinaryReady
              ? "📎 Attach receipt (optional)"
              : "📎 Receipts need Cloudinary keys"}
          </button>
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
