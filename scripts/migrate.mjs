import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

const url =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL;
if (!url) throw new Error("No database URL in env");

const dir = join(process.cwd(), "drizzle");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const pool = new Pool({ connectionString: url });
await pool.query(
  "CREATE TABLE IF NOT EXISTS drizzle_migrations (hash text primary key, applied_at timestamptz not null default now())",
);
const applied = new Set(
  (await pool.query("SELECT hash FROM drizzle_migrations")).rows.map(
    (r) => r.hash,
  ),
);

for (const file of files) {
  if (applied.has(file)) {
    console.log(`= ${file} already applied`);
    continue;
  }
  const sql = await readFile(join(dir, file), "utf8");
  console.log(`> applying ${file}`);
  await pool.query(sql);
  await pool.query("INSERT INTO drizzle_migrations (hash) VALUES ($1)", [
    file,
  ]);
}

const tables = await pool.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
);
console.log(tables.rows.map((r) => r.table_name).join("\n"));
await pool.end();
