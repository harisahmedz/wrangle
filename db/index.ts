import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle>;

function createClient(): { pool: Pool; db: Database } {
  const connectionString =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  const configured = Boolean(connectionString);
  const pool = new Pool({
    connectionString:
      connectionString ?? "postgresql://wrangle:missing@DATABASE-URL.invalid/db",
  });

  if (!configured) {
    const fail = (): never => {
      throw new Error("DATABASE_URL is not set");
    };
    pool.query = fail as typeof pool.query;
    pool.connect = fail as unknown as typeof pool.connect;
  }

  return { pool, db: drizzle(pool, { schema }) };
}

const globalForDb = globalThis as unknown as {
  wranglePool?: Pool;
  wrangleDb?: Database;
};

function instance(): { pool: Pool; db: Database } {
  if (!globalForDb.wrangleDb) {
    const created = createClient();
    globalForDb.wranglePool = created.pool;
    globalForDb.wrangleDb = created.db;
  }
  return {
    pool: globalForDb.wranglePool!,
    db: globalForDb.wrangleDb!,
  };
}

const client = instance();
export const pool = client.pool;
export const db = client.db;
