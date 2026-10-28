"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  addExpense,
  deleteExpense,
  restoreExpense,
  updateExpense,
} from "@/lib/actions/expenses";
import type { CategoryChip } from "@/components/expenses/types";
import { ACCENT_HEX } from "@/lib/palette";
import { mutate } from "@/lib/mutations";
import { useOutbox } from "@/lib/outbox/client";
import { uuidv7 } from "@/lib/uuid";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

function sanitizeAmount(value: string): string {
  const [whole, ...rest] = value.replace(/[^0-9.]/g, "").split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

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
  defaultSpentOn,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryChip[];
  cloudinaryReady: boolean;
  defaultSpentOn: string;
  currency: string;
  editing?: {
    id: string;
    amountMinor: number;
    categoryId: string;
    spentOn: string;
    note: string | null;
    receiptUrl: string | null;
    paymentMethod: string | null;
  } | null;
}) {
  const pushToast = useToast();
  const [raw, setRaw] = useState(
    editing ? (editing.amountMinor / 100).toFixed(2) : "",
  );
  const [categoryId, setCategoryId] = useState(
    editing?.categoryId ?? categories[0]?.id ?? "",
  );
  const [spentOn, setSpentOn] = useState(editing?.spentOn ?? defaultSpentOn);
  const [note, setNote] = useState(editing?.note ?? "");
  const [paymentMethod, setPaymentMethod] = useState(editing?.paymentMethod ?? "");
  const [receipt, setReceipt] = useState<ReceiptUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [receiptRemoved, setReceiptRemoved] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  // Receipt upload needs the network (Q7): hide the attach control offline.
  const { offline } = useOutbox();

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

  const symbol =
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency;

  const pickFile = async (file: File) => {
    if (!cloudinaryReady) {
      setUploadError("Receipt uploads aren't set up yet.");
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
      const uploaded = (await res.json()) as {
        public_id: string;
        secure_url: string;
      };
      const isPdf = prepared.mime === "application/pdf";
      setReceipt({
        publicId: uploaded.public_id,
        url: uploaded.secure_url,
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
    if (!editing && !receipt) {
      // No receipt → queued `expense.create` (OFFLINE-OUTBOX §1, Q7). With a
      // receipt the Cloudinary upload already happened online, so the
      // existing `addExpense` action below is still the path.
      startTransition(async () => {
        const res = await mutate(
          {
            kind: "expense.create",
            id: uuidv7(),
            categoryId,
            amountMinor: minorValue,
            spentOn,
            note: note || undefined,
            paymentMethod: paymentMethod || undefined,
          },
          `Add expense ${(minorValue / 100).toFixed(2)}`,
        );
        if (!res.ok) {
          pushToast({ message: res.error });
          return;
        }
        close();
      });
      return;
    }
    const fd = new FormData();
    fd.set("amountMinor", String(minorValue));
    fd.set("categoryId", categoryId);
    fd.set("spentOn", spentOn);
    fd.set("note", note);
    fd.set("paymentMethod", paymentMethod);
    startTransition(async () => {
      let res;
      if (editing) {
        fd.set("expenseId", editing.id);
        if (receiptRemoved) {
          fd.set("receiptPublicId", "");
          fd.set("receiptUrl", "");
        } else if (receipt) {
          fd.set("receiptPublicId", receipt.publicId);
          fd.set("receiptUrl", receipt.url);
        }
        res = await updateExpense(fd);
      } else {
        fd.set("receiptPublicId", receipt?.publicId ?? "");
        fd.set("receiptUrl", receipt?.url ?? "");
        res = await addExpense(fd);
      }
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      close();
    });
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
      close();
    });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      label={editing ? "Edit expense" : "Add expense"}
    >
      <div className="space-y-4">
        <div className="flex items-baseline justify-center gap-1 text-4xl font-bold tabular-nums">
          <span aria-hidden className="text-muted">{symbol}</span>
          <input
            value={raw}
            onChange={(e) => setRaw(sanitizeAmount(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && save()}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`Amount in ${currency}`}
            className="w-44 min-w-0 bg-transparent text-center outline-none placeholder:text-muted/50"
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5 md:hidden">
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
                  ? { backgroundColor: `${c.color ?? ACCENT_HEX}22`, borderColor: c.color ?? ACCENT_HEX }
                  : undefined
              }
              className={
                "min-h-11 rounded-full border px-3 py-1.5 text-xs transition-colors " +
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
            className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note…"
            maxLength={500}
            aria-label="Note"
            className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm"
          />
        </div>
        <input
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          placeholder="Paid with… (cash, card, wallet — optional)"
          maxLength={40}
          aria-label="Payment method"
          className="h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-xs"
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
        ) : offline ? (
          <p className="text-center text-xs text-muted">Receipts need a connection — add one later.</p>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!cloudinaryReady}
            className="w-full rounded-md border border-dashed border-border py-2.5 text-sm text-muted hover:text-text disabled:opacity-50"
          >
            {cloudinaryReady
              ? "📎 Attach receipt (optional)"
              : "Receipt uploads aren't available yet"}
          </button>
        )}

        <div className="sticky bottom-0 -mx-5 -mb-[calc(1.25rem+env(safe-area-inset-bottom))] flex items-center justify-between border-t border-border bg-surface px-5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-3 sm:-mb-5">
          {editing ? (
            <Button variant="danger" size="sm" onClick={remove}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={!minorValue || !categoryId || !spentOn || pending}
            >
              {pending ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
