// The port the E2E `next start` server listens on. Each git worktree gets its
// own via E2E_PORT in its .env.local (.claude/tools/worktree.mjs writes it), so
// parallel worktrees can run Playwright at the same time.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
