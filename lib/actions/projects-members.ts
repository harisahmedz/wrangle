"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, memberships } from "@/db/schema";
import { requireMembership } from "@/lib/authz";
import { canLeave } from "@/lib/sharing/permissions";
import { failure, type ActionResult } from "@/lib/actions/types";

export async function leaveProject(formData: FormData): Promise<ActionResult> {
  const projectId = String(formData.get("projectId") ?? "");
  const ctx = await requireMembership(projectId, "viewer");

  if (!canLeave(ctx.role)) {
    return failure("Transfer ownership before leaving");
  }

  await db
    .delete(memberships)
    .where(
      and(
        eq(memberships.projectId, projectId),
        eq(memberships.userId, ctx.userId),
      ),
    );

  await db.insert(activities).values({
    projectId,
    actorId: ctx.userId,
    entityType: "membership",
    entityId: ctx.userId,
    verb: "left",
  });

  revalidatePath("/", "layout");
  redirect("/today");
}
