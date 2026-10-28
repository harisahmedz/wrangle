import { z } from "zod";
import { boardKind } from "@/db/schema";
import type { Mutation } from "@/lib/mutations/types";
import { OUTBOX_BATCH_MAX, OUTBOX_WIRE_VERSION } from "@/lib/outbox/types";
import { isValidPositionKey } from "@/lib/order";

// Server-side validation of the outbox wire format (docs/OFFLINE-OUTBOX.md
// §2.2): runs in `POST /api/outbox` only, so Zod never joins the client
// bundle for the queue. Field limits mirror lib/validation/kanban.ts,
// detail.ts, learning.ts and lib/actions/expenses.ts.

const uuid = z.string().uuid();
// A malformed key ("zz", "a10") would poison the whole column — see lib/order.ts.
const position = z.string().min(1).max(100).refine(isValidPositionKey, "Invalid position");
const isoDateTime = z.string().datetime({ offset: true });
// ROADMAP-V2 S9/B85: the wire carries 1|2|3|null only (P4 = null); the
// client normalizes a typed/picked 4 before enqueueing (lib/kanban/priority.ts).
const priority = z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable();

const mutationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("card.create"),
    id: uuid,
    target: z.union([
      z.object({ columnId: uuid }),
      z.object({ projectId: uuid, boardKind: z.enum(boardKind.enumValues) }),
    ]),
    title: z.string().trim().min(1).max(300),
    position: position.optional(),
    dueAt: isoDateTime.nullable().optional(),
    isAllDay: z.boolean().optional(),
    priority: priority.optional(),
  }),
  z.object({
    kind: z.literal("card.update"),
    cardId: uuid,
    patch: z.object({
      title: z.string().trim().min(1).max(300).optional(),
      description: z.string().max(10_000).nullable().optional(),
      dueAt: isoDateTime.nullable().optional(),
      isAllDay: z.boolean().optional(),
      priority: priority.optional(),
    }),
  }),
  z.object({ kind: z.literal("card.complete"), cardId: uuid, completed: z.boolean() }),
  z.object({ kind: z.literal("card.move"), cardId: uuid, toColumnId: uuid, position }),
  z.object({ kind: z.literal("checklist.set"), itemId: uuid, cardId: uuid, isDone: z.boolean() }),
  z.object({
    kind: z.literal("learning.setStatus"),
    itemId: uuid,
    status: z.enum(["want", "learning", "learned"]),
  }),
  z.object({
    kind: z.literal("expense.create"),
    id: uuid,
    categoryId: uuid,
    amountMinor: z.number().int().positive().max(100_000_000),
    // A real calendar date — "2026-13-45" matched the old regex and made Postgres throw.
    spentOn: z.iso.date(),
    note: z.string().max(500).optional(),
    paymentMethod: z.string().max(40).optional(),
  }),
]);

// Compile-time check that the schema's output is a valid `Mutation` — if the
// union in lib/mutations/types.ts grows a field, this is where it fails.
type SchemaMutation = z.infer<typeof mutationSchema>;
const _assignable: Mutation = null as unknown as SchemaMutation;
void _assignable;

export const outboxBatchSchema = z.object({
  v: z.literal(OUTBOX_WIRE_VERSION),
  entries: z
    .array(
      z.object({
        id: uuid,
        createdAt: z.number().int().nonnegative(),
        mutation: mutationSchema,
      }),
    )
    .min(1)
    .max(OUTBOX_BATCH_MAX),
});
