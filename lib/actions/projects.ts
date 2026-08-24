"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import { memberships, projects } from "@/db/schema";
import { requireMembership, requireUser } from "@/lib/authz";
import { seedProjectBoards } from "@/lib/kanban/seed";
import {
  createProjectSchema,
  moveProjectSchema,
  projectIdSchema,
  updateProjectSchema,
} from "@/lib/validation/projects";
import { failure, type ActionResult } from "@/lib/actions/types";

const MAX_PROJECTS_PER_USER = 50;

async function nextPosition(): Promise<string> {
  const [last] = await db
    .select({ position: projects.position })
    .from(projects)
    .orderBy(desc(projects.position))
    .limit(1);
  return generateKeyBetween(last?.position ?? null, null);
}

export async function createProject(
  formData: FormData,
): Promise<ActionResult<{ projectId: string }>> {
  const userId = await requireUser();

  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    emoji: formData.get("emoji") || undefined,
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return failure("Invalid project details");
  const { name, emoji, color } = parsed.data;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  if (count >= MAX_PROJECTS_PER_USER) {
    return failure("Project limit reached (50)");
  }

  const position = await nextPosition();
  const projectId = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ name, emoji, color, ownerId: userId, position })
      .returning({ id: projects.id });
    await tx.insert(memberships).values({
      projectId: project.id,
      userId,
      role: "owner",
    });
    await seedProjectBoards(tx, project.id);
    return project.id;
  });

  revalidatePath("/", "layout");
  return { ok: true, data: { projectId } };
}

export async function updateProject(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateProjectSchema.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    emoji: formData.get("emoji"),
    color: formData.get("color"),
  });
  if (!parsed.success) return failure("Invalid project details");

  await requireMembership(parsed.data.projectId, "admin");

  await db
    .update(projects)
    .set({
      name: parsed.data.name,
      emoji: parsed.data.emoji,
      color: parsed.data.color,
    })
    .where(and(eq(projects.id, parsed.data.projectId), isNull(projects.deletedAt)));

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setArchived(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = projectIdSchema.safeParse({
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return failure("Invalid project");

  const ctx = await requireMembership(parsed.data.projectId, "admin");
  const [project] = await db
    .select({ isPersonal: projects.isPersonal })
    .from(projects)
    .where(eq(projects.id, ctx.projectId))
    .limit(1);

  if (!project) return failure("Project not found");
  if (project.isPersonal && formData.get("archived") === "true") {
    return failure("My Space cannot be archived");
  }

  await db
    .update(projects)
    .set({
      archivedAt:
        formData.get("archived") === "true" ? new Date() : null,
    })
    .where(eq(projects.id, ctx.projectId));

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteToTrash(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = projectIdSchema.safeParse({
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return failure("Invalid project");

  const ctx = await requireMembership(parsed.data.projectId, "owner");
  const [project] = await db
    .select({ isPersonal: projects.isPersonal })
    .from(projects)
    .where(eq(projects.id, ctx.projectId))
    .limit(1);

  if (!project) return failure("Project not found");
  if (project.isPersonal) return failure("My Space cannot be deleted");

  await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(eq(projects.id, ctx.projectId));

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function restoreFromTrash(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = projectIdSchema.safeParse({
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return failure("Invalid project");

  await requireMembership(parsed.data.projectId, "owner");

  await db
    .update(projects)
    .set({ deletedAt: null })
    .where(eq(projects.id, parsed.data.projectId));

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function purgeProject(formData: FormData): Promise<ActionResult> {
  const parsed = projectIdSchema.safeParse({
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return failure("Invalid project");

  const ctx = await requireMembership(parsed.data.projectId, "owner");
  const [project] = await db
    .select({ isPersonal: projects.isPersonal })
    .from(projects)
    .where(eq(projects.id, ctx.projectId))
    .limit(1);

  if (!project) return failure("Project not found");
  if (project.isPersonal) return failure("My Space cannot be deleted");

  await db.delete(projects).where(eq(projects.id, ctx.projectId));

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function moveProject(formData: FormData): Promise<ActionResult> {
  const parsed = moveProjectSchema.safeParse({
    projectId: formData.get("projectId"),
    direction: formData.get("direction"),
  });
  if (!parsed.success) return failure("Invalid move");

  const userId = await requireMembership(parsed.data.projectId, "admin").then(
    (c) => c.userId,
  );

  const rows = await db
    .select({ id: projects.id, position: projects.position })
    .from(memberships)
    .innerJoin(projects, eq(memberships.projectId, projects.id))
    .where(and(eq(memberships.userId, userId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.position));

  const index = rows.findIndex((r) => r.id === parsed.data.projectId);
  if (index === -1) return failure("Project not found");

  let newPosition: string | null = null;
  if (parsed.data.direction === "up" && index > 0) {
    newPosition = generateKeyBetween(
      rows[index - 2]?.position ?? null,
      rows[index - 1].position,
    );
  } else if (
    parsed.data.direction === "down" &&
    index < rows.length - 1
  ) {
    newPosition = generateKeyBetween(
      rows[index + 1].position,
      rows[index + 2]?.position ?? null,
    );
  }

  if (!newPosition) return { ok: true };

  await db
    .update(projects)
    .set({ position: newPosition })
    .where(eq(projects.id, parsed.data.projectId));

  revalidatePath("/", "layout");
  return { ok: true };
}
