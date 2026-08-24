import { Pool } from "@neondatabase/serverless";

const url =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL;
if (!url) throw new Error("No database URL in env");

const DEFAULT_COLUMNS = {
  todo: ["Backlog", "Doing", "Done"],
  ideas: ["Raw", "Shortlist", "Promoted"],
  work: ["Todo", "In Progress", "Blocked", "Done"],
};

function key(n) {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(97 + rem) + s;
    n = Math.floor((n - rem) / 26);
  }
  return s;
}

const pool = new Pool({ connectionString: url });

const orphan = await pool.query(
  `SELECT p.id FROM projects p
   WHERE NOT EXISTS (SELECT 1 FROM boards b WHERE b.project_id = p.id)`,
);

for (const row of orphan.rows) {
  console.log(`> seeding boards for project ${row.id}`);
  for (const [kind, name] of [
    ["todo", "To-Do"],
    ["ideas", "Ideas"],
    ["work", "Work"],
  ]) {
    const boardRes = await pool.query(
      `INSERT INTO boards (id, project_id, kind, name, position)
       VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id`,
      [row.id, kind, name, key(["todo", "ideas", "work"].indexOf(kind) + 1)],
    );
    const cols = DEFAULT_COLUMNS[kind];
    for (let i = 0; i < cols.length; i++) {
      await pool.query(
        `INSERT INTO columns (id, board_id, name, position)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [boardRes.rows[0].id, cols[i], key(i + 1)],
      );
    }
  }
}

console.log(`backfilled ${orphan.rowCount} project(s)`);
await pool.end();
