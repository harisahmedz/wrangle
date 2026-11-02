import { describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

// lib/actions/invites.ts → lib/authz.ts → @/auth (next-auth), which doesn't
// load under vitest.
vi.mock("@/auth", () => ({ auth: async () => null }));

import { db } from "@/db";
import { activities, inviteRedemptions, invites, memberships, projects, users } from "@/db/schema";
import * as inviteActions from "@/lib/actions/invites";
import { redeemInviteForUser } from "@/lib/sharing/redeem";
import { hashToken } from "@/lib/sharing/tokens";
import { uuidv7 } from "@/lib/uuid";

describe("invite redemption is not a Server Action", () => {
  it("lib/actions/invites.ts (\"use server\") no longer exports redeemInviteForUser", () => {
    expect("redeemInviteForUser" in inviteActions).toBe(false);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("redeemInviteForUser (integration)", () => {
  it(
    "joins once with the invite's role, is idempotent, and refuses revoked/unknown tokens",
    { timeout: 60_000 },
    async () => {
      const suffix = Date.now();
      const owner = uuidv7();
      const joiner = uuidv7();
      const projectId = uuidv7();
      const liveHash = hashToken(`live-${suffix}-${uuidv7()}`);
      const revokedHash = hashToken(`revoked-${suffix}-${uuidv7()}`);
      const expiresAt = new Date(Date.now() + 86_400_000);

      try {
        await db.insert(users).values([
          { id: owner, name: "Redeem Owner", email: `redeem-owner-${suffix}@example.com`, emailVerified: new Date() },
          { id: joiner, name: "Redeem Joiner", email: `redeem-joiner-${suffix}@example.com`, emailVerified: new Date() },
        ]);
        await db.insert(projects).values({ id: projectId, name: "__redeem_test", ownerId: owner });
        await db.insert(memberships).values({ projectId, userId: owner, role: "owner", position: "a0" });
        await db.insert(invites).values([
          { projectId, tokenHash: liveHash, role: "viewer", createdBy: owner, expiresAt, maxUses: 5 },
          { projectId, tokenHash: revokedHash, role: "member", createdBy: owner, expiresAt, revokedAt: new Date() },
        ]);

        expect(await redeemInviteForUser(hashToken("nope"), joiner)).toEqual({ state: "invalid" });
        expect(await redeemInviteForUser(revokedHash, joiner)).toEqual({ state: "revoked" });
        expect(await redeemInviteForUser(liveHash, joiner)).toEqual({ state: "joined", projectId });
        expect(await redeemInviteForUser(liveHash, joiner)).toEqual({ state: "already-member", projectId });

        const [m] = await db
          .select({ role: memberships.role })
          .from(memberships)
          .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, joiner)));
        expect(m?.role).toBe("viewer");
        const [inv] = await db.select({ usedCount: invites.usedCount }).from(invites).where(eq(invites.tokenHash, liveHash));
        expect(inv?.usedCount).toBe(1);
      } finally {
        await db.delete(activities).where(eq(activities.projectId, projectId));
        const inviteRows = await db.select({ id: invites.id }).from(invites).where(eq(invites.projectId, projectId));
        if (inviteRows.length > 0) {
          await db.delete(inviteRedemptions).where(inArray(inviteRedemptions.inviteId, inviteRows.map((r) => r.id)));
        }
        await db.delete(invites).where(eq(invites.projectId, projectId));
        await db.delete(memberships).where(eq(memberships.projectId, projectId));
        await db.delete(projects).where(eq(projects.id, projectId));
        await db.delete(users).where(inArray(users.id, [owner, joiner]));
      }
    },
  );
});
