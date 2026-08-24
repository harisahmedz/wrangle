import type { Metadata } from "next";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cards,
  columns,
  expenseCategories,
  expenses,
  memberships,
  projects,
} from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { restoreCard } from "@/lib/kanban/actions";
import { restoreExpense } from "@/lib/actions/expenses";
import { restoreFromTrash } from "@/lib/actions/projects";
import { formatMinor } from "@/lib/money";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Trash" };

const TRASH_RETENTION_DAYS = 30;

export default async function TrashPage() {
  const userId = await requireUser();

  const [trashedProjects, trashedCards, trashedExpenses] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        emoji: projects.emoji,
        daysLeft: sql<number>`greatest(0, ${TRASH_RETENTION_DAYS} - extract(day from now() - ${projects.deletedAt})::int)`,
      })
      .from(memberships)
      .innerJoin(projects, eq(memberships.projectId, projects.id))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.role, "owner"),
          isNotNull(projects.deletedAt),
        ),
      )
      .orderBy(desc(projects.deletedAt)),
    db
      .select({
        id: cards.id,
        title: cards.title,
        projectName: projects.name,
        columnName: columns.name,
        daysLeft: sql<number>`greatest(0, ${TRASH_RETENTION_DAYS} - extract(day from now() - ${cards.deletedAt})::int)`,
      })
      .from(cards)
      .innerJoin(projects, eq(cards.projectId, projects.id))
      .innerJoin(columns, eq(cards.columnId, columns.id))
      .innerJoin(
        memberships,
        and(
          eq(memberships.projectId, projects.id),
          eq(memberships.userId, userId),
        ),
      )
      .where(isNotNull(cards.deletedAt))
      .orderBy(desc(cards.deletedAt))
      .limit(50),
    db
      .select({
        id: expenses.id,
        note: expenses.note,
        amountMinor: expenses.amountMinor,
        categoryName: expenseCategories.name,
        daysLeft: sql<number>`greatest(0, ${TRASH_RETENTION_DAYS} - extract(day from now() - ${expenses.deletedAt})::int)`,
      })
      .from(expenses)
      .innerJoin(
        expenseCategories,
        eq(expenses.categoryId, expenseCategories.id),
      )
      .where(and(eq(expenses.userId, userId), isNotNull(expenses.deletedAt)))
      .orderBy(desc(expenses.deletedAt))
      .limit(50),
  ]);

  async function restoreProjectForm(formData: FormData) {
    "use server";
    await restoreFromTrash(formData);
  }

  async function restoreCardForm(formData: FormData) {
    "use server";
    await restoreCard(formData);
  }

  async function restoreExpenseForm(formData: FormData) {
    "use server";
    await restoreExpense(formData);
  }

  const empty =
    trashedProjects.length === 0 &&
    trashedCards.length === 0 &&
    trashedExpenses.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trash</h1>
        <p className="mt-1 text-sm text-muted">
          Deleted items restorable for {TRASH_RETENTION_DAYS} days.
        </p>
      </div>

      {empty && <EmptyState icon="🗑️" title="Trash is empty" />}

      {trashedProjects.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Projects
          </h2>
          <ul className="space-y-2">
            {trashedProjects.map((p) => (
              <TrashRow
                key={p.id}
                icon={p.emoji ?? "📁"}
                title={p.name}
                meta={`${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left`}
                actionFn={restoreProjectForm} fieldName="projectId" id={p.id} label="Restore"
              />
            ))}
          </ul>
        </section>
      )}

      {trashedCards.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Cards
          </h2>
          <ul className="space-y-2">
            {trashedCards.map((c) => (
              <TrashRow
                key={c.id}
                icon="🗂️"
                title={c.title}
                meta={`${c.projectName} · ${c.columnName} · ${c.daysLeft}d left`}
                actionFn={restoreCardForm} fieldName="cardId" id={c.id} label="Restore"
              />
            ))}
          </ul>
        </section>
      )}

      {trashedExpenses.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Expenses
          </h2>
          <ul className="space-y-2">
            {trashedExpenses.map((e) => (
              <TrashRow
                key={e.id}
                icon="💸"
                title={e.note || e.categoryName}
                meta={`${formatMinor(e.amountMinor)} · ${e.categoryName} · ${e.daysLeft}d left`}
                actionFn={restoreExpenseForm} fieldName="expenseId" id={e.id} label="Restore"
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TrashRow({
  icon,
  title,
  meta,
  actionFn,
  fieldName,
  id,
  label,
}: {
  icon: string;
  title: string;
  meta: string;
  actionFn: (formData: FormData) => Promise<void>;
  fieldName: string;
  id: string;
  label: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
      <span className="text-lg opacity-70">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-muted">{meta}</p>
      </div>
      <form action={actionFn}>
        <input type="hidden" name={fieldName} value={id} />
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-surface-2"
        >
          {label}
        </button>
      </form>
    </li>
  );
}

