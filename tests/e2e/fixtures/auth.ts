// Shared authenticated-session fixture for Playwright e2e specs.
//
// Mints a real DB session the same way `.claude/tools/screens.mjs` and
// `scripts/selftest.mjs` do (direct `sessions` insert + a
// `authjs.session-token` cookie) instead of driving the OAuth flow, then
// deletes it in teardown. Specs that need a signed-in demo@wrangle.local
// session should import `test`/`expect` from here instead of
// `@playwright/test` directly.
//
// S8's offline outbox e2e (docs/OFFLINE-OUTBOX.md §8) is expected to reuse
// this fixture rather than re-implement session minting.
import { test as base, expect } from "@playwright/test";
import { Pool } from "@neondatabase/serverless";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
}

/** Specs should `test.skip(!hasDatabase, "...")` rather than let queries throw. */
export const hasDatabase = Boolean(databaseUrl());

/** Opens a fresh Pool for test-specific setup/teardown queries (e.g. resetting a pref). Caller must `.end()` it. */
export function openPool(): Pool {
  const url = databaseUrl();
  if (!url) throw new Error("No DATABASE_URL in env");
  return new Pool({ connectionString: url });
}

export type DemoSession = {
  userId: string;
  email: string;
  /** The demo user's personal ("My Space") project, if seeded. */
  projectId: string | null;
};

export const test = base.extend<{ demoSession: DemoSession }>({
  // Playwright's fixture API calls this second argument `use`, but it's a
  // plain callback (not a React hook) — renamed to `provide` so eslint's
  // react-hooks rule doesn't mistake this for a component/hook definition.
  demoSession: async ({ context, baseURL }, provide) => {
    if (!hasDatabase) {
      // Caller is expected to `test.skip(!hasDatabase, ...)` before using
      // this value; this placeholder just keeps the fixture type-safe.
      await provide({ userId: "", email: "", projectId: null });
      return;
    }

    const pool = openPool();
    const token = "e2e-" + crypto.randomUUID();
    let userId = "";
    let email = "";
    let projectId: string | null = null;

    try {
      const user = (
        await pool.query(`SELECT id, email FROM users WHERE email = $1`, ["demo@wrangle.local"])
      ).rows[0];
      if (!user) {
        throw new Error(
          "demo@wrangle.local not found — seed it first (see .claude/tools/HANDOFF.md)",
        );
      }
      userId = user.id;
      email = user.email;

      const project = (
        await pool.query(
          `SELECT p.id FROM projects p JOIN memberships m ON m.project_id = p.id
           WHERE m.user_id = $1 AND p.is_personal = true LIMIT 1`,
          [userId],
        )
      ).rows[0];
      projectId = project?.id ?? null;

      await pool.query(
        `INSERT INTO sessions (session_token, user_id, expires) VALUES ($1, $2, $3)`,
        [token, userId, new Date(Date.now() + 3_600_000).toISOString()],
      );
      await context.addCookies([{ name: "authjs.session-token", value: token, url: baseURL }]);

      await provide({ userId, email, projectId });
    } finally {
      await pool.query(`DELETE FROM sessions WHERE session_token = $1`, [token]).catch(() => {});
      await pool.end();
    }
  },
});

export { expect };
