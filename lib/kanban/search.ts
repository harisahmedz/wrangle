import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { BoardKind } from "@/db/schema";

export type SearchHit = {
  id: string;
  title: string;
  kind: BoardKind;
  rank: number;
};

export async function searchProjectCards(
  projectId: string,
  query: string,
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const result = await db.execute(sql`
    SELECT c.id,
           c.title,
           b.kind::text AS kind,
           ts_rank(
             to_tsvector('english', c.title || ' ' || coalesce(c.description, '')),
             websearch_to_tsquery('english', ${trimmed})
           ) * 2 +
           similarity(c.title, ${trimmed}) AS rank
    FROM cards c
    JOIN boards b ON b.id = c.board_id
    WHERE c.project_id = ${projectId}
      AND c.deleted_at IS NULL
      AND (
        to_tsvector('english', c.title || ' ' || coalesce(c.description, ''))
          @@ websearch_to_tsquery('english', ${trimmed})
        OR c.title % ${trimmed}
      )
    ORDER BY rank DESC
    LIMIT 30
  `);

  return result.rows.map((r) => {
    const row = r as { id: string; title: string; kind: string; rank: string };
    return {
      id: row.id,
      title: row.title,
      kind: row.kind as BoardKind,
      rank: Number(row.rank),
    };
  });
}
