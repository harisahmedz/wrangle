"use server";

import { refresh } from "next/cache";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import { expenseCategories, expenses, users } from "@/db/schema";
import type { ExpenseCategory } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import {
  createUploadSignature,
  isOwnUploadPublicId,
  receiptDeliveryUrl,
} from "@/lib/cloudinary";
import { isHexColor, isValidAmountMinor } from "@/lib/money";
import { failure, type ActionResult } from "@/lib/actions/types";

const MAX_NOTE = 500;

function cleanDate(raw: unknown): string | null {
  const s = String(raw ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function ownCategory(
  userId: string,
  categoryId: string,
): Promise<ExpenseCategory | null> {
  const [row] = await db
    .select()
    .from(expenseCategories)
    .where(
      and(
        eq(expenseCategories.id, categoryId),
        eq(expenseCategories.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// `ensureCategories` lives in lib/expenses/ensure-categories.ts (S8): every
// export of this file is a public Server Action endpoint, and it takes a
// `userId` on trust.

export async function addExpense(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUser();

  const categoryId = String(formData.get("categoryId") ?? "");
  const amountMinor = Number(formData.get("amountMinor"));
  const spentOn = cleanDate(formData.get("spentOn"));
  const note = String(formData.get("note") ?? "").slice(0, MAX_NOTE);
  const paymentMethod =
    String(formData.get("paymentMethod") ?? "").slice(0, 40) || null;
  const receiptPublicId =
    String(formData.get("receiptPublicId") ?? "").trim().slice(0, 300) || null;

  if (!isValidAmountMinor(amountMinor)) {
    return failure("Enter an amount above zero");
  }
  if (!spentOn) return failure("Invalid date");
  if (receiptPublicId && !isOwnUploadPublicId(receiptPublicId, userId, "receipts")) {
    return failure("Invalid receipt upload");
  }
  const category = await ownCategory(userId, categoryId);
  if (!category) return failure("Pick a category");
  const [user] = await db
    .select({ currency: users.currency })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [row] = await db
    .insert(expenses)
    .values({
      userId,
      categoryId,
      amountMinor,
      currency: user?.currency ?? "USD",
      spentOn,
      note: note || null,
      paymentMethod,
      receiptPublicId,
      receiptUrl: receiptPublicId ? receiptDeliveryUrl(receiptPublicId) : null,
    })
    .returning({ id: expenses.id });

  refresh();
  return { ok: true, data: { id: row.id } };
}

export async function updateExpense(
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUser();
  const id = String(formData.get("expenseId") ?? "");

  const [existing] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId), isNull(expenses.deletedAt)))
    .limit(1);
  if (!existing) return failure("Expense not found");

  const categoryId = String(formData.get("categoryId") ?? "");
  const amountMinor = Number(formData.get("amountMinor"));
  const spentOn = cleanDate(formData.get("spentOn"));

  if (!isValidAmountMinor(amountMinor)) {
    return failure("Invalid amount");
  }
  if (!spentOn) return failure("Invalid date");
  if (!(await ownCategory(userId, categoryId))) return failure("Pick a category");

  const receiptPatch: Partial<{
    receiptPublicId: string | null;
    receiptUrl: string | null;
  }> = {};
  if (formData.has("receiptPublicId")) {
    const publicId =
      String(formData.get("receiptPublicId") ?? "").trim().slice(0, 300) || null;
    if (publicId && !isOwnUploadPublicId(publicId, userId, "receipts")) {
      return failure("Invalid receipt upload");
    }
    receiptPatch.receiptPublicId = publicId;
    receiptPatch.receiptUrl = publicId ? receiptDeliveryUrl(publicId) : null;
  }

  await db
    .update(expenses)
    .set({
      categoryId,
      amountMinor,
      spentOn,
      note: String(formData.get("note") ?? "").slice(0, MAX_NOTE) || null,
      paymentMethod:
        String(formData.get("paymentMethod") ?? "").slice(0, 40) || null,
      ...receiptPatch,
    })
    .where(eq(expenses.id, id));

  refresh();
  return { ok: true };
}

export async function deleteExpense(
  formData: FormData,
): Promise<ActionResult<{ note: string | null; amountMinor: number }>> {
  const userId = await requireUser();
  const id = String(formData.get("expenseId") ?? "");

  const [existing] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId), isNull(expenses.deletedAt)))
    .limit(1);
  if (!existing) return failure("Expense not found");

  await db
    .update(expenses)
    .set({ deletedAt: new Date() })
    .where(eq(expenses.id, id));

  refresh();
  return {
    ok: true,
    data: { note: existing.note, amountMinor: existing.amountMinor },
  };
}

export async function restoreExpense(formData: FormData): Promise<ActionResult> {
  const userId = await requireUser();
  const id = String(formData.get("expenseId") ?? "");

  const result = await db
    .update(expenses)
    .set({ deletedAt: null })
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning({ id: expenses.id });

  if (result.length === 0) return failure("Not found");
  refresh();
  return { ok: true };
}

export async function createCategory(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").slice(0, 4) || null;
  const color = String(formData.get("color") ?? "#8b5cf6");
  if (!name || name.length > 40) return failure("Name required (≤40)");
  if (!isHexColor(color)) return failure("Invalid colour");

  const row = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`categories:${userId}`}::text))`,
    );
    const [last] = await tx
      .select({ position: expenseCategories.position })
      .from(expenseCategories)
      .where(eq(expenseCategories.userId, userId))
      .orderBy(desc(expenseCategories.position))
      .limit(1);
    const [created] = await tx
      .insert(expenseCategories)
      .values({
        userId,
        name,
        emoji,
        color,
        position: generateKeyBetween(last?.position ?? null, null),
      })
      .returning({ id: expenseCategories.id });
    return created;
  });

  refresh();
  return { ok: true, data: { id: row.id } };
}

export async function updateCategory(
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUser();
  const id = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").slice(0, 4) || null;
  const color = String(formData.get("color") ?? "#8b5cf6");
  if (!name || name.length > 40) return failure("Name required (≤40)");
  if (!isHexColor(color)) return failure("Invalid colour");

  const result = await db
    .update(expenseCategories)
    .set({ name, emoji, color })
    .where(
      and(eq(expenseCategories.id, id), eq(expenseCategories.userId, userId)),
    )
    .returning({ id: expenseCategories.id });

  if (result.length === 0) return failure("Category not found");
  refresh();
  return { ok: true };
}

export async function archiveCategory(
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUser();
  const id = String(formData.get("categoryId") ?? "");

  const result = await db
    .update(expenseCategories)
    .set({ isArchived: sql`NOT ${expenseCategories.isArchived}` })
    .where(
      and(eq(expenseCategories.id, id), eq(expenseCategories.userId, userId)),
    )
    .returning({ id: expenseCategories.id });

  if (result.length === 0) return failure("Category not found");
  refresh();
  return { ok: true };
}

export async function signReceiptUpload(
  formData: FormData,
): Promise<
  ActionResult<{
    cloudName: string;
    apiKey: string;
    publicId: string;
    timestamp: number;
    signature: string;
    folder: string;
    allowedFormats: string;
  }>
> {
  const userId = await requireUser();
  const mime = String(formData.get("mime") ?? "");
  const bytes = Number(formData.get("bytes") ?? 0);

  const sig = createUploadSignature(userId, mime, bytes, "receipts");
  if (!sig.ok) return failure(sig.error);

  return {
    ok: true,
    data: {
      cloudName: sig.cloudName,
      apiKey: sig.apiKey,
      publicId: sig.publicId,
      timestamp: sig.timestamp,
      signature: sig.signature,
      folder: sig.folder,
      allowedFormats: sig.allowedFormats,
    },
  };
}
