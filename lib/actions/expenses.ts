"use server";

import { refresh } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import type { ExpenseCategory } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import {
  createUploadSignature,
} from "@/lib/cloudinary";
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

export async function ensureCategories(userId: string): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenseCategories)
    .where(eq(expenseCategories.userId, userId));
  if (count > 0) return;

  const defaults = [
    { name: "Food", emoji: "🍔", color: "#f59e0b" },
    { name: "Transport", emoji: "🚌", color: "#3b82f6" },
    { name: "Bills", emoji: "🧾", color: "#64748b" },
    { name: "Shopping", emoji: "🛍️", color: "#ec4899" },
    { name: "Health", emoji: "💊", color: "#10b981" },
    { name: "Fun", emoji: "🎉", color: "#8b5cf6" },
    { name: "Other", emoji: "📦", color: "#14b8a6" },
  ];
  await db.insert(expenseCategories).values(
    defaults.map((c, i) => ({
      userId,
      name: c.name,
      emoji: c.emoji,
      color: c.color,
      position: `a${i}`,
    })),
  );
}

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
    String(formData.get("receiptPublicId") ?? "") || null;
  const receiptUrl = String(formData.get("receiptUrl") ?? "") || null;

  if (!amountMinor || !Number.isInteger(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000) {
    return failure("Enter an amount above zero");
  }
  if (!spentOn) return failure("Invalid date");
  const category = await ownCategory(userId, categoryId);
  if (!category) return failure("Pick a category");

  const [row] = await db
    .insert(expenses)
    .values({
      userId,
      categoryId,
      amountMinor,
      currency: "USD",
      spentOn,
      note: note || null,
      paymentMethod,
      receiptPublicId,
      receiptUrl,
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

  if (!amountMinor || !Number.isInteger(amountMinor) || amountMinor <= 0) {
    return failure("Invalid amount");
  }
  if (!spentOn) return failure("Invalid date");
  if (!(await ownCategory(userId, categoryId))) return failure("Pick a category");

  await db
    .update(expenses)
    .set({
      categoryId,
      amountMinor,
      spentOn,
      note: String(formData.get("note") ?? "").slice(0, MAX_NOTE) || null,
      paymentMethod:
        String(formData.get("paymentMethod") ?? "").slice(0, 40) || null,
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

  const [last] = await db
    .select({ position: expenseCategories.position })
    .from(expenseCategories)
    .where(eq(expenseCategories.userId, userId))
    .orderBy(asc(expenseCategories.position))
    .limit(1);

  const [row] = await db
    .insert(expenseCategories)
    .values({
      userId,
      name,
      emoji,
      color,
      position: generateKeyBetween(last?.position ?? null, null),
    })
    .returning({ id: expenseCategories.id });

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
    },
  };
}
