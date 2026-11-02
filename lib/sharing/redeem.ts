// Invite redemption for the /join/[token] page.
//
// Deliberately NOT in a "use server" file: every export of such a file
// becomes a publicly callable Server Action endpoint, and this function
// trusts its `userId` argument. Callers must pass the userId from their own
// `auth()` session.
import { and, desc, eq, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import { activities, inviteRedemptions, invites, memberships } from "@/db/schema";

export async function redeemInviteForUser(
  tokenHash: string,
  userId: string,
): Promise<
  | { state: "joined"; projectId: string }
  | { state: "already-member"; projectId: string }
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "used-up" }
  | { state: "revoked" }
> {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash))
      .limit(1)
      .for("update");

    if (!invite) return { state: "invalid" };
    if (invite.revokedAt) return { state: "revoked" };
    if (invite.expiresAt.getTime() < Date.now()) return { state: "expired" };

    const [existingMembership] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.projectId, invite.projectId),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);

    if (existingMembership) {
      return { state: "already-member", projectId: invite.projectId };
    }

    if (invite.usedCount >= invite.maxUses) return { state: "used-up" };

    const [existingRedemption] = await tx
      .select({ inviteId: inviteRedemptions.inviteId })
      .from(inviteRedemptions)
      .where(
        and(
          eq(inviteRedemptions.inviteId, invite.id),
          eq(inviteRedemptions.userId, userId),
        ),
      )
      .limit(1);
    if (existingRedemption && invite.usedCount >= invite.maxUses) {
      return { state: "used-up" };
    }

    if (!existingRedemption) {
      await tx
        .insert(inviteRedemptions)
        .values({ inviteId: invite.id, userId });
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`projects:${userId}`}))`);
    const [lastMembership] = await tx
      .select({ position: memberships.position })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .orderBy(desc(memberships.position))
      .limit(1);

    await tx.insert(memberships).values({
      projectId: invite.projectId,
      userId,
      role: invite.role,
      invitedBy: invite.createdBy,
      position: generateKeyBetween(lastMembership?.position ?? null, null),
    });

    await tx
      .update(invites)
      .set({ usedCount: invite.usedCount + 1 })
      .where(eq(invites.id, invite.id));

    await tx.insert(activities).values({
      projectId: invite.projectId,
      actorId: userId,
      entityType: "membership",
      entityId: userId,
      verb: "joined",
    });

    return { state: "joined", projectId: invite.projectId };
  });
}
