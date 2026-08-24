import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import { boards, columns } from "@/db/schema";
import type { BoardKind } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const DEFAULT_BOARDS: Array<{ kind: BoardKind; name: string }> = [
  { kind: "todo", name: "To-Do" },
  { kind: "ideas", name: "Ideas" },
  { kind: "work", name: "Work" },
];

const DEFAULT_COLUMNS: Record<BoardKind, Array<{ name: string; done?: boolean }>> = {
  todo: [{ name: "Backlog" }, { name: "Doing" }, { name: "Done", done: true }],
  ideas: [{ name: "Raw" }, { name: "Shortlist" }, { name: "Promoted" }],
  work: [
    { name: "Todo" },
    { name: "In Progress" },
    { name: "Blocked" },
    { name: "Done", done: true },
  ],
};

export async function seedProjectBoards(tx: Tx, projectId: string) {
  let boardPos: string | null = null;
  for (const { kind, name } of DEFAULT_BOARDS) {
    boardPos = generateKeyBetween(boardPos, null);
    const [board] = await tx
      .insert(boards)
      .values({ projectId, kind, name, position: boardPos })
      .returning({ id: boards.id });

    let colPos: string | null = null;
    for (const col of DEFAULT_COLUMNS[kind]) {
      colPos = generateKeyBetween(colPos, null);
      await tx.insert(columns).values({
        boardId: board.id,
        name: col.name,
        isDone: col.done ?? false,
        position: colPos,
      });
    }
  }
}
