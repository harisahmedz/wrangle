import { sql } from "drizzle-orm";
import { db } from "@/db";

type LimitResult = { allowed: boolean; remaining: number };

const FIXED_WINDOW_SEC = 10;

export async function hitRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<LimitResult> {
  const bucketMs = Math.max(windowSec, FIXED_WINDOW_SEC) * 1000;
  const windowStart = new Date(Math.floor(Date.now() / bucketMs) * bucketMs);

  const result = await db.execute(sql`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, ${windowStart.toISOString()})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start = ${windowStart.toISOString()}::timestamptz
        THEN rate_limits.count + 1
        ELSE 1
      END,
      window_start = ${windowStart.toISOString()}::timestamptz
    RETURNING count
  `);

  const rows = result.rows as Array<{ count: number }>;
  const count = Number(rows[0]?.count ?? 1);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
