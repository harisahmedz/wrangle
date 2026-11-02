import { describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

// The actions and the export route call auth() (next-auth doesn't load under
// vitest) and revalidatePath() (needs a request scope); stub both and drive
// them against the real DB, DB-gated like weekly-reschedule.test.ts.
const h = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/auth", () => ({
  auth: async () => (h.userId ? { user: { id: h.userId } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, refresh: () => {} }));

import { db } from "@/db";
import {
  activities,
  boards,
  cards,
  columns,
  comments,
  inviteRedemptions,
  invites,
  memberships,
  projects,
  users,
} from "@/db/schema";
import { GET as exportGET } from "@/app/api/export/route";
import { removeMember } from "@/lib/actions/invites";
import { purgeProject, restoreFromTrash } from "@/lib/actions/projects";
import { redeemInviteForUser } from "@/lib/sharing/redeem";
import { hashToken } from "@/lib/sharing/tokens";
import { uuidv7 } from "@/lib/uuid";

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

async function cleanup(projectIds: string[], userIds: string[]) {
  await db.delete(activities).where(inArray(activities.projectId, projectIds));
  const inviteRows = await db.select({ id: invites.id }).from(invites).where(inArray(invites.projectId, projectIds));
  if (inviteRows.length > 0) {
    await db.delete(inviteRedemptions).where(inArray(inviteRedemptions.inviteId, inviteRows.map((r) => r.id)));
  }
  await db.delete(invites).where(inArray(invites.projectId, projectIds));
  await db.delete(cards).where(inArray(cards.projectId, projectIds)); // comments cascade
  await db.delete(boards).where(inArray(boards.projectId, projectIds)); // columns cascade
  await db.delete(memberships).where(inArray(memberships.projectId, projectIds));
  await db.delete(projects).where(inArray(projects.id, projectIds));
  await db.delete(users).where(inArray(users.id, userIds));
}

describe.skipIf(!process.env.DATABASE_URL)("member removal (integration)", () => {
  it(
    "a removed member can't rejoin with old invites, and the export drops that project's data",
    { timeout: 90_000 },
    async () => {
      const suffix = Date.now();
      const owner = uuidv7();
      const member = uuidv7();
      const kicked = uuidv7(); // project the member is removed from
      const kept = uuidv7(); // project the member stays in
      const projectIds = [kicked, kept];
      const boardIds = projectIds.map(() => uuidv7());
      const columnIds = projectIds.map(() => uuidv7());
      const kickedCard = uuidv7();
      const keptCard = uuidv7();
      const usedHash = hashToken(`used-${suffix}-${uuidv7()}`);
      const otherHash = hashToken(`other-${suffix}-${uuidv7()}`);
      const expiresAt = new Date(Date.now() + 86_400_000);

      try {
        await db.insert(users).values([
          { id: owner, name: "Removal Owner", email: `removal-owner-${suffix}@example.com`, emailVerified: new Date() },
          { id: member, name: "Removal Member", email: `removal-member-${suffix}@example.com`, emailVerified: new Date() },
        ]);
        await db.insert(projects).values([
          { id: kicked, name: "__removal_kicked", ownerId: owner },
          { id: kept, name: "__removal_kept", ownerId: owner },
        ]);
        await db.insert(memberships).values([
          { projectId: kicked, userId: owner, role: "owner", position: "a0" },
          { projectId: kept, userId: owner, role: "owner", position: "a1" },
          { projectId: kept, userId: member, role: "member", position: "a0" },
        ]);
        await db.insert(boards).values(
          projectIds.map((projectId, i) => ({ id: boardIds[i], projectId, kind: "todo" as const, name: "To-Do" })),
        );
        await db.insert(columns).values(
          projectIds.map((_, i) => ({ id: columnIds[i], boardId: boardIds[i], name: "Backlog", position: "a0" })),
        );
        await db.insert(invites).values([
          { projectId: kicked, tokenHash: usedHash, role: "member", createdBy: owner, expiresAt, maxUses: 5 },
          { projectId: kicked, tokenHash: otherHash, role: "member", createdBy: owner, expiresAt, maxUses: 5 },
        ]);

        // Member joins through the invite, writes a card, both comment on it.
        expect(await redeemInviteForUser(usedHash, member)).toEqual({ state: "joined", projectId: kicked });
        await db.insert(cards).values([
          { id: kickedCard, columnId: columnIds[0], boardId: boardIds[0], projectId: kicked, title: "kicked card", position: "a0", createdBy: member },
          { id: keptCard, columnId: columnIds[1], boardId: boardIds[1], projectId: kept, title: "kept card", position: "a0", createdBy: member },
        ]);
        await db.insert(comments).values([
          { cardId: kickedCard, authorId: owner, body: "owner secret" },
          { cardId: kickedCard, authorId: member, body: "member note" },
        ]);

        h.userId = owner;
        expect(await removeMember(form({ projectId: kicked, userId: member }))).toEqual({ ok: true });

        // Neither the link they used nor another existing link lets them back.
        expect(await redeemInviteForUser(usedHash, member)).toEqual({ state: "revoked" });
        expect(await redeemInviteForUser(otherHash, member)).toEqual({ state: "revoked" });
        const back = await db
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.projectId, kicked), eq(memberships.userId, member)));
        expect(back).toHaveLength(0);

        // A fresh invite created after the removal still works.
        const freshHash = hashToken(`fresh-${suffix}-${uuidv7()}`);
        await db.insert(invites).values({ projectId: kicked, tokenHash: freshHash, role: "viewer", createdBy: owner, expiresAt });
        // Re-remove before checking the export so the member is out again.
        expect(await redeemInviteForUser(freshHash, member)).toEqual({ state: "joined", projectId: kicked });
        expect(await removeMember(form({ projectId: kicked, userId: member }))).toEqual({ ok: true });

        h.userId = member;
        const res = await exportGET(new Request("http://localhost/api/export"));
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
          cards: Array<{ id: string }>;
          comments: Array<{ cardId: string; body: string }>;
          activities: Array<{ projectId: string }>;
        };
        const cardIds = data.cards.map((c) => c.id);
        expect(cardIds).toContain(keptCard);
        expect(cardIds).not.toContain(kickedCard);
        expect(data.comments.filter((c) => c.cardId === kickedCard)).toHaveLength(0);
        expect(data.activities.filter((a) => a.projectId === kicked)).toHaveLength(0);
      } finally {
        h.userId = "";
        await cleanup(projectIds, [owner, member]);
      }
    },
  );
});

describe.skipIf(!process.env.DATABASE_URL)("Trash restore and purge (integration)", () => {
  it(
    "the owner can restore and purge a trashed project; a non-owner member can't",
    { timeout: 60_000 },
    async () => {
      const suffix = Date.now();
      const owner = uuidv7();
      const admin = uuidv7();
      const restored = uuidv7();
      const purged = uuidv7();
      const live = uuidv7();
      const projectIds = [restored, purged, live];

      try {
        await db.insert(users).values([
          { id: owner, name: "Trash Owner", email: `trash-owner-${suffix}@example.com`, emailVerified: new Date() },
          { id: admin, name: "Trash Admin", email: `trash-admin-${suffix}@example.com`, emailVerified: new Date() },
        ]);
        await db.insert(projects).values([
          { id: restored, name: "__trash_restore", ownerId: owner, deletedAt: new Date() },
          { id: purged, name: "__trash_purge", ownerId: owner, deletedAt: new Date() },
          { id: live, name: "__trash_live", ownerId: owner },
        ]);
        await db.insert(memberships).values(
          projectIds.flatMap((projectId, i) => [
            { projectId, userId: owner, role: "owner" as const, position: `a${i}` },
            { projectId, userId: admin, role: "admin" as const, position: `a${i}` },
          ]),
        );

        // Non-owner: 404 for both.
        h.userId = admin;
        await expect(restoreFromTrash(form({ projectId: restored }))).rejects.toThrow();
        await expect(purgeProject(form({ projectId: purged }))).rejects.toThrow();

        // Owner: purge only works from the Trash, never on a live project.
        h.userId = owner;
        await expect(purgeProject(form({ projectId: live }))).rejects.toThrow();

        expect(await restoreFromTrash(form({ projectId: restored }))).toEqual({ ok: true });
        expect(await purgeProject(form({ projectId: purged }))).toEqual({ ok: true });

        const rows = await db
          .select({ id: projects.id, deletedAt: projects.deletedAt })
          .from(projects)
          .where(inArray(projects.id, projectIds));
        expect(rows.find((r) => r.id === restored)?.deletedAt).toBeNull();
        expect(rows.find((r) => r.id === purged)).toBeUndefined();
        expect(rows.find((r) => r.id === live)).toBeDefined();
      } finally {
        h.userId = "";
        await cleanup(projectIds, [owner, admin]);
      }
    },
  );
});
