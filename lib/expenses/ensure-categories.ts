// Seeds a user's default expense categories if they have none. A plain
// module, not "use server": it takes a `userId` on trust, so it must never
// be a callable Server Action endpoint (S8 review L4 — it used to be
// exported from lib/actions/expenses.ts). Callers authorize first
// (app/(app)/money/page.tsx calls it after `requireUser()`).
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories } from "@/db/schema";

export async function ensureCategories(userId: string): Promise<void> {
  const defaults = [
    { name: "Food", emoji: "🍔", color: "#f59e0b" },
    { name: "Transport", emoji: "🚌", color: "#3b82f6" },
    { name: "Bills", emoji: "🧾", color: "#64748b" },
    { name: "Shopping", emoji: "🛍️", color: "#ec4899" },
    { name: "Health", emoji: "💊", color: "#10b981" },
    { name: "Fun", emoji: "🎉", color: "#8b5cf6" },
    { name: "Other", emoji: "📦", color: "#14b8a6" },
  ];
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`categories:${userId}`}::text))`,
    );
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(expenseCategories)
      .where(eq(expenseCategories.userId, userId));
    if (count > 0) return;
    await tx.insert(expenseCategories).values(
      defaults.map((c, i) => ({
        userId,
        name: c.name,
        emoji: c.emoji,
        color: c.color,
        position: `a${i}`,
      })),
    );
  });
}
