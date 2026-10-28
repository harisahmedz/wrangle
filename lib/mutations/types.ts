import type { BoardKind } from "@/db/schema";

/**
 * The client mutation layer's `Mutation` union (docs/OFFLINE-OUTBOX.md §2.2,
 * §9.2). This is the type S8's IndexedDB queue will use unchanged — S4/S5
 * call sites only go through `mutate()` so that swap doesn't touch them.
 */
export type Mutation =
  | {
      kind: "card.create";
      id: string;
      target: { columnId: string } | { projectId: string; boardKind: BoardKind };
      title: string;
      position?: string;
      dueAt?: string | null;
      isAllDay?: boolean;
      /** ROADMAP-V2 S9: 1|2|3|null — already normalized by the caller (P4 is null). */
      priority?: 1 | 2 | 3 | null;
    }
  | {
      kind: "card.update";
      cardId: string;
      patch: {
        title?: string;
        description?: string | null;
        dueAt?: string | null;
        isAllDay?: boolean;
        priority?: 1 | 2 | 3 | null;
      };
    }
  | { kind: "card.complete"; cardId: string; completed: boolean }
  | { kind: "card.move"; cardId: string; toColumnId: string; position: string }
  | { kind: "checklist.set"; itemId: string; cardId: string; isDone: boolean }
  | { kind: "learning.setStatus"; itemId: string; status: "want" | "learning" | "learned" }
  | {
      kind: "expense.create";
      id: string;
      categoryId: string;
      amountMinor: number;
      spentOn: string;
      note?: string;
      paymentMethod?: string;
    };

export type MutationResult = { ok: true; data?: unknown } | { ok: false; error: string };
