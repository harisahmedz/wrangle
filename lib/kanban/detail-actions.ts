"use server";

import { refresh } from "next/cache";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import {
  attachments,
  activities,
  cardAssignees,
  cardLabels,
  cards,
  checklistItems,
  comments,
  labels,
  memberships,
} from "@/db/schema";
import { requireMembership } from "@/lib/authz";
import { createUploadSignature, isOwnUploadPublicId, receiptDeliveryUrl } from "@/lib/cloudinary";
import {
  addChecklistItemSchema,
  addCommentSchema,
  attachmentIdSchema,
  checklistItemSchema,
  commentIdSchema,
  confirmAttachmentSchema,
  labelIdSchema,
  labelSchema,
  setCardAssigneesSchema,
  setCardLabelsSchema,
  signUploadSchema,
} from "@/lib/validation/detail";
import { failure, type ActionResult } from "@/lib/actions/types";

async function cardProjectId(cardId: string): Promise<string | null> {
  const [row] = await db
    .select({ projectId: cards.projectId })
    .from(cards)
    .where(and(eq(cards.id, cardId), isNull(cards.deletedAt)))
    .limit(1);
  return row?.projectId ?? null;
}

async function requireCard(cardId: string, minRole: "viewer" | "member" = "member") {
  const projectId = await cardProjectId(cardId);
  if (!projectId) return null;
  const ctx = await requireMembership(projectId, minRole);
  return ctx;
}

function touch() {
  refresh();
}

export async function addChecklistItem(formData: FormData): Promise<ActionResult> {
  const parsed = addChecklistItemSchema.safeParse({
    cardId: formData.get("cardId"),
    text: formData.get("text"),
  });
  if (!parsed.success) return failure("Invalid item");

  const ctx = await requireCard(parsed.data.cardId);
  if (!ctx) return failure("Card not found");

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`checklist:${parsed.data.cardId}`}::text))`,
    );
    const [last] = await tx
      .select({ position: checklistItems.position })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.cardId, parsed.data.cardId),
          isNull(checklistItems.deletedAt),
        ),
      )
      .orderBy(desc(checklistItems.position))
      .limit(1);
    await tx.insert(checklistItems).values({
      cardId: parsed.data.cardId,
      text: parsed.data.text,
      position: generateKeyBetween(last?.position ?? null, null),
    });
  });
  touch();
  return { ok: true };
}

export async function deleteChecklistItem(formData: FormData): Promise<ActionResult> {
  const parsed = checklistItemSchema.safeParse({
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) return failure("Invalid item");

  const [item] = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.id, parsed.data.itemId))
    .limit(1);
  if (!item) return failure("Item not found");
  if (!(await requireCard(item.cardId))) return failure("Card not found");

  await db
    .update(checklistItems)
    .set({ deletedAt: new Date() })
    .where(eq(checklistItems.id, parsed.data.itemId));
  touch();
  return { ok: true };
}

export async function restoreChecklistItem(formData: FormData): Promise<ActionResult> {
  const parsed = checklistItemSchema.safeParse({
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) return failure("Invalid item");

  const [item] = await db
    .select({ cardId: checklistItems.cardId, position: checklistItems.position })
    .from(checklistItems)
    .where(eq(checklistItems.id, parsed.data.itemId))
    .limit(1);
  if (!item || !(await requireCard(item.cardId))) return failure("Item not found");

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`checklist:${item.cardId}`}::text))`,
    );
    const [collision] = await tx
      .select({ id: checklistItems.id })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.cardId, item.cardId),
          eq(checklistItems.position, item.position),
          isNull(checklistItems.deletedAt),
          ne(checklistItems.id, parsed.data.itemId),
        ),
      )
      .limit(1);
    if (collision) {
      const [last] = await tx
        .select({ position: checklistItems.position })
        .from(checklistItems)
        .where(
          and(
            eq(checklistItems.cardId, item.cardId),
            isNull(checklistItems.deletedAt),
          ),
        )
        .orderBy(desc(checklistItems.position))
        .limit(1);
      await tx
        .update(checklistItems)
        .set({ position: generateKeyBetween(last?.position ?? null, null) })
        .where(eq(checklistItems.id, collision.id));
    }
    await tx
      .update(checklistItems)
      .set({ deletedAt: null })
      .where(eq(checklistItems.id, parsed.data.itemId));
  });
  touch();
  return { ok: true };
}

export async function createLabel(
  formData: FormData,
): Promise<ActionResult<{ labelId: string }>> {
  const parsed = labelSchema.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) return failure("Invalid label");

  await requireMembership(parsed.data.projectId, "admin");

  const [label] = await db
    .insert(labels)
    .values(parsed.data)
    .returning({ id: labels.id });
  touch();
  return { ok: true, data: { labelId: label.id } };
}

export async function deleteLabel(formData: FormData): Promise<ActionResult> {
  const parsed = labelIdSchema.safeParse({ labelId: formData.get("labelId") });
  if (!parsed.success) return failure("Invalid label");

  const [label] = await db
    .select({ projectId: labels.projectId })
    .from(labels)
    .where(eq(labels.id, parsed.data.labelId))
    .limit(1);
  if (!label) return failure("Label not found");

  await requireMembership(label.projectId, "admin");
  await db
    .update(labels)
    .set({ deletedAt: new Date() })
    .where(eq(labels.id, parsed.data.labelId));
  touch();
  return { ok: true };
}

export async function restoreLabel(formData: FormData): Promise<ActionResult> {
  const parsed = labelIdSchema.safeParse({ labelId: formData.get("labelId") });
  if (!parsed.success) return failure("Invalid label");

  const [label] = await db
    .select({ projectId: labels.projectId })
    .from(labels)
    .where(eq(labels.id, parsed.data.labelId))
    .limit(1);
  if (!label) return failure("Label not found");
  await requireMembership(label.projectId, "admin");

  await db
    .update(labels)
    .set({ deletedAt: null })
    .where(eq(labels.id, parsed.data.labelId));
  touch();
  return { ok: true };
}

export async function setCardLabels(formData: FormData): Promise<ActionResult> {
  const raw = formData.get("labelIds");
  let ids: string[] = [];
  try {
    ids = raw ? (JSON.parse(String(raw)) as string[]) : [];
  } catch {
    return failure("Invalid labels");
  }
  const parsed = setCardLabelsSchema.safeParse({
    cardId: formData.get("cardId"),
    labelIds: ids,
  });
  if (!parsed.success) return failure("Invalid labels");

  if (!(await requireCard(parsed.data.cardId))) return failure("Card not found");

  const projectLabels = await db
    .select({ id: labels.id })
    .from(labels)
    .innerJoin(cards, eq(labels.projectId, cards.projectId))
    .where(
      and(eq(cards.id, parsed.data.cardId), isNull(labels.deletedAt)),
    );
  const allowed = new Set(projectLabels.map((l) => l.id));

  await db.transaction(async (tx) => {
    await tx.delete(cardLabels).where(eq(cardLabels.cardId, parsed.data.cardId));
    const valid = parsed.data.labelIds.filter((id) => allowed.has(id));
    if (valid.length > 0) {
      await tx.insert(cardLabels).values(
        valid.map((labelId) => ({ cardId: parsed.data.cardId, labelId })),
      );
    }
  });
  touch();
  return { ok: true };
}

export async function setCardAssignees(formData: FormData): Promise<ActionResult> {
  const raw = formData.get("userIds");
  let ids: string[] = [];
  try {
    ids = raw ? (JSON.parse(String(raw)) as string[]) : [];
  } catch {
    return failure("Invalid assignees");
  }
  const parsed = setCardAssigneesSchema.safeParse({
    cardId: formData.get("cardId"),
    userIds: ids,
  });
  if (!parsed.success) return failure("Invalid assignees");

  if (!(await requireCard(parsed.data.cardId))) return failure("Card not found");

  const projectId = await cardProjectId(parsed.data.cardId);
  if (!projectId) return failure("Card not found");
  const members = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.projectId, projectId));
  const allowed = new Set(members.map((m) => m.userId));

  await db.transaction(async (tx) => {
    await tx.delete(cardAssignees).where(eq(cardAssignees.cardId, parsed.data.cardId));
    const valid = parsed.data.userIds.filter((id) => allowed.has(id));
    if (valid.length > 0) {
      await tx.insert(cardAssignees).values(
        valid.map((userId) => ({ cardId: parsed.data.cardId, userId })),
      );
    }
  });
  touch();
  return { ok: true };
}

export async function addComment(formData: FormData): Promise<ActionResult<{ commentId: string }>> {
  const parsed = addCommentSchema.safeParse({
    cardId: formData.get("cardId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return failure("Comment must be 1-5000 characters");

  const ctx = await requireCard(parsed.data.cardId);
  if (!ctx) return failure("Card not found");

  const [comment] = await db
    .insert(comments)
    .values({
      cardId: parsed.data.cardId,
      authorId: ctx.userId,
      body: parsed.data.body,
    })
    .returning({ id: comments.id });

  await logActivity(ctx.projectId, ctx.userId, "comment", comment.id, "created");
  touch();
  return { ok: true, data: { commentId: comment.id } };
}

export async function deleteComment(formData: FormData): Promise<ActionResult> {
  const parsed = commentIdSchema.safeParse({
    commentId: formData.get("commentId"),
  });
  if (!parsed.success) return failure("Invalid comment");

  const [comment] = await db
    .select({ id: comments.id, cardId: comments.cardId, authorId: comments.authorId })
    .from(comments)
    .where(and(eq(comments.id, parsed.data.commentId), isNull(comments.deletedAt)))
    .limit(1);
  if (!comment) return failure("Comment not found");

  const projectId = await cardProjectId(comment.cardId);
  if (!projectId) return failure("Card not found");
  const ctx = await requireMembership(projectId, "viewer");
  const isAuthor = comment.authorId === ctx.userId;
  if (!isAuthor && ctx.role !== "admin" && ctx.role !== "owner") {
    return failure("Not allowed");
  }

  await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(eq(comments.id, parsed.data.commentId));
  touch();
  return { ok: true };
}

export async function restoreComment(formData: FormData): Promise<ActionResult> {
  const parsed = commentIdSchema.safeParse({
    commentId: formData.get("commentId"),
  });
  if (!parsed.success) return failure("Invalid comment");

  const [comment] = await db
    .select({ cardId: comments.cardId, authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.id, parsed.data.commentId))
    .limit(1);
  if (!comment) return failure("Comment not found");

  const projectId = await cardProjectId(comment.cardId);
  if (!projectId) return failure("Card not found");
  const ctx = await requireMembership(projectId, "viewer");
  if (
    comment.authorId !== ctx.userId &&
    ctx.role !== "admin" &&
    ctx.role !== "owner"
  ) {
    return failure("Not allowed");
  }

  await db
    .update(comments)
    .set({ deletedAt: null })
    .where(eq(comments.id, parsed.data.commentId));
  touch();
  return { ok: true };
}

export async function signUpload(
  formData: FormData,
): Promise<ActionResult<{ cloudName: string; apiKey: string; publicId: string; timestamp: number; signature: string; folder: string; allowedFormats: string }>> {
  const parsed = signUploadSchema.safeParse({
    cardId: formData.get("cardId"),
    mime: formData.get("mime"),
    bytes: Number(formData.get("bytes")),
  });
  if (!parsed.success) return failure("Invalid upload request");

  const ctx = await requireCard(parsed.data.cardId);
  if (!ctx) return failure("Card not found");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attachments)
    .where(
      and(
        eq(attachments.cardId, parsed.data.cardId),
        isNull(attachments.deletedAt),
      ),
    );
  if (count >= 10) return failure("Attachment limit reached (10)");

  const sig = createUploadSignature(ctx.userId, parsed.data.mime, parsed.data.bytes);
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

export async function confirmAttachment(formData: FormData): Promise<ActionResult> {
  const parsed = confirmAttachmentSchema.safeParse({
    cardId: formData.get("cardId"),
    publicId: formData.get("publicId"),
    url: formData.get("url"),
    mime: formData.get("mime"),
    bytes: Number(formData.get("bytes")),
    width: formData.get("width") ? Number(formData.get("width")) : undefined,
    height: formData.get("height") ? Number(formData.get("height")) : undefined,
  });
  if (!parsed.success) return failure("Invalid attachment metadata");

  const ctx = await requireCard(parsed.data.cardId);
  if (!ctx) return failure("Card not found");
  if (!isOwnUploadPublicId(parsed.data.publicId, ctx.userId)) {
    return failure("Invalid upload destination");
  }

  await db.insert(attachments).values({
    cardId: parsed.data.cardId,
    cloudinaryPublicId: parsed.data.publicId,
    url: receiptDeliveryUrl(parsed.data.publicId),
    mime: parsed.data.mime,
    bytes: parsed.data.bytes,
    width: parsed.data.width ?? null,
    height: parsed.data.height ?? null,
    uploadedBy: ctx.userId,
  });
  touch();
  return { ok: true };
}

export async function deleteAttachment(formData: FormData): Promise<ActionResult> {
  const parsed = attachmentIdSchema.safeParse({
    attachmentId: formData.get("attachmentId"),
  });
  if (!parsed.success) return failure("Invalid attachment");

  const [row] = await db
    .select({
      id: attachments.id,
      cardId: attachments.cardId,
      uploadedBy: attachments.uploadedBy,
      projectId: cards.projectId,
    })
    .from(attachments)
    .innerJoin(cards, eq(attachments.cardId, cards.id))
    .where(
      and(
        eq(attachments.id, parsed.data.attachmentId),
        isNull(attachments.deletedAt),
      ),
    )
    .limit(1);
  if (!row || !row.cardId) return failure("Attachment not found");

  const ctx = await requireMembership(row.projectId, "viewer");
  const canDelete =
    row.uploadedBy === ctx.userId || ctx.role === "admin" || ctx.role === "owner";
  if (!canDelete) return failure("Not allowed");

  await db
    .update(attachments)
    .set({ deletedAt: new Date() })
    .where(eq(attachments.id, row.id));
  touch();
  return { ok: true };
}

export async function restoreAttachment(formData: FormData): Promise<ActionResult> {
  const parsed = attachmentIdSchema.safeParse({
    attachmentId: formData.get("attachmentId"),
  });
  if (!parsed.success) return failure("Invalid attachment");

  const [row] = await db
    .select({
      id: attachments.id,
      cardId: attachments.cardId,
      uploadedBy: attachments.uploadedBy,
      projectId: cards.projectId,
    })
    .from(attachments)
    .innerJoin(cards, eq(attachments.cardId, cards.id))
    .where(eq(attachments.id, parsed.data.attachmentId))
    .limit(1);
  if (!row || !row.cardId) return failure("Attachment not found");

  const ctx = await requireMembership(row.projectId, "viewer");
  const canRestore =
    row.uploadedBy === ctx.userId || ctx.role === "admin" || ctx.role === "owner";
  if (!canRestore) return failure("Not allowed");

  await db
    .update(attachments)
    .set({ deletedAt: null })
    .where(eq(attachments.id, row.id));
  touch();
  return { ok: true };
}

async function logActivity(
  projectId: string,
  actorId: string,
  entityType: string,
  entityId: string,
  verb: string,
) {
  await db.insert(activities).values({
    projectId,
    actorId,
    entityType,
    entityId,
    verb,
  });
}
