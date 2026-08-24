import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { ensureCategories } from "@/lib/actions/expenses";
import {
  formatMinor,
  monthBounds,
  monthLabel,
  shiftMonth,
} from "@/lib/money";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { Donut, TrendBars } from "@/components/expenses/charts";
import {
  ExpenseList,
} from "@/components/expenses/expense-list";
import {
  AddExpenseButton,
} from "@/components/expenses/add-button";
import {
  ExpenseAddTrigger,
} from "@/components/pwa/triggers";
import type {
  CategoryChip,
  ExpenseRow,
} from "@/components/expenses/types";

type Props = { searchParams: Promise<{ m?: string; add?: string }> };

export const metadata: Metadata = { title: "Money" };

const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function MoneyPage({ searchParams }: Props) {
  const userId = await requireUser();
  await ensureCategories(userId);

  const sp = await searchParams;
  const nowKey = new Date().toISOString().slice(0, 7);
  const rawMonth = sp.m ?? nowKey;
  const month = MONTH_RE.test(rawMonth) ? rawMonth : nowKey;
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  const { startDate, endDate } = monthBounds(month);
  const lastBounds = monthBounds(prevMonth);
  const trendStart = monthBounds(shiftMonth(month, -5)).startDate;

  const [categories, monthRows, trendRows] = await Promise.all([
    db
      .select()
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.userId, userId),
          eq(expenseCategories.isArchived, false),
        ),
      )
      .orderBy(asc(expenseCategories.position)),
    db
      .select({
        id: expenses.id,
        amountMinor: expenses.amountMinor,
        spentOn: expenses.spentOn,
        note: expenses.note,
        categoryId: expenses.categoryId,
        receiptUrl: expenses.receiptUrl,
        categoryName: expenseCategories.name,
        categoryEmoji: expenseCategories.emoji,
        categoryColor: expenseCategories.color,
      })
      .from(expenses)
      .innerJoin(
        expenseCategories,
        eq(expenses.categoryId, expenseCategories.id),
      )
      .where(
        and(
          eq(expenses.userId, userId),
          isNull(expenses.deletedAt),
          gte(expenses.spentOn, startDate),
          lt(expenses.spentOn, endDate),
        ),
      )
      .orderBy(desc(expenses.spentOn)),
    db
      .select({
        month: sql<string>`to_char(${expenses.spentOn}, 'YYYY-MM')`,
        total: sql<number>`sum(${expenses.amountMinor})::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          isNull(expenses.deletedAt),
          gte(expenses.spentOn, trendStart),
          lt(expenses.spentOn, endDate),
        ),
      )
      .groupBy(sql`to_char(${expenses.spentOn}, 'YYYY-MM')`),
  ]);

  const categoryChips: CategoryChip[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
  }));

  const rows: ExpenseRow[] = monthRows.map((r) => ({
    id: r.id,
    amountMinor: r.amountMinor,
    spentOn: r.spentOn,
    note: r.note,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    categoryEmoji: r.categoryEmoji,
    categoryColor: r.categoryColor,
    receiptUrl: r.receiptUrl,
  }));

  const byCategory = new Map<string, number>();
  for (const r of rows) {
    byCategory.set(r.categoryId, (byCategory.get(r.categoryId) ?? 0) + r.amountMinor);
  }
  const slices = [...byCategory.entries()]
    .map(([id, value]) => {
      const cat = categories.find((c) => c.id === id);
      return {
        label: cat?.name ?? "Other",
        value,
        color: cat?.color ?? null,
      };
    })
    .sort((a, b) => b.value - a.value);

  const totalThis = rows.reduce((s, r) => s + r.amountMinor, 0);

  const trendMap = new Map(trendRows.map((t) => [t.month, Number(t.total)]));
  const months6 = Array.from({ length: 6 }, (_, i) => {
    const key = shiftMonth(month, i - 5);
    return { key, total: trendMap.get(key) ?? 0 };
  });

  const [lastRow] = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::int` })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        isNull(expenses.deletedAt),
        gte(expenses.spentOn, lastBounds.startDate),
        lt(expenses.spentOn, lastBounds.endDate),
      ),
    );
  const totalLast = Number(lastRow?.total ?? 0);
  const delta =
    totalLast === 0
      ? null
      : Math.round(((totalThis - totalLast) / totalLast) * 100);

  const biggest = [...rows].sort((a, b) => b.amountMinor - a.amountMinor).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Money</h1>
        <div className="flex items-center gap-2">
          <AddExpenseButton
            categories={categoryChips}
            cloudinaryReady={isCloudinaryConfigured()}
          />
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          <Link
            href={`/money?m=${prevMonth}`}
            aria-label="Previous month"
            className="rounded px-2 py-1 text-muted hover:text-text"
          >
            ←
          </Link>
          <span className="min-w-32 text-center text-sm font-medium">
            {monthLabel(month)}
          </span>
          {month < nowKey ? (
            <Link
              href={`/money?m=${nextMonth}`}
              aria-label="Next month"
              className="rounded px-2 py-1 text-muted hover:text-text"
            >
              →
            </Link>
          ) : (
            <span aria-hidden className="px-2 py-1 opacity-30">→</span>
          )}
        </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Spent this month</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {formatMinor(totalThis)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {delta === null
              ? totalLast === 0 && totalThis === 0
                ? "—"
                : "No data for last month"
              : delta > 0
                ? `▲ ${delta}% vs last month`
                : delta < 0
                  ? `▼ ${Math.abs(delta)}% vs last month`
                  : "Same as last month"}
          </p>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">By category</p>
          <Donut slices={slices} />
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">
            Last 6 months
          </p>
          <TrendBars months={months6} />
        </section>
      </div>

      <ExpenseList
        rows={rows}
        categories={categoryChips}
        cloudinaryReady={isCloudinaryConfigured()}
      />

      {biggest.length >= 2 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Biggest this month
          </p>
          <ul className="space-y-1 text-sm">
            {biggest.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span className="truncate">{r.note || r.categoryName}</span>
                <span className="tabular-nums text-muted">
                  {formatMinor(r.amountMinor)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sp.add === "1" && <ExpenseAddTrigger />}

      <AddExpenseButton
        categories={categoryChips}
        cloudinaryReady={isCloudinaryConfigured()}
        variant="fab"
      />
    </div>
  );
}
