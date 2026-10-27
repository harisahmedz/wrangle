import { spawn } from "node:child_process";
import { join } from "node:path";
import { E2E_ORIGIN, E2E_PORT } from "./port";

const HEALTH_URL = `${E2E_ORIGIN}/api/health`;
const IN_USE = `Port ${E2E_PORT} is already in use`;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function globalSetup() {
  try {
    const existing = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(500) });
    if (existing.ok) throw new Error(IN_USE);
  } catch (error) {
    if (error instanceof Error && error.message === IN_USE) {
      throw error;
    }
  }

  const nextBin = join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(E2E_PORT)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  server.unref();

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before E2E startup (code ${server.exitCode})`);
    }
    try {
      const response = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) break;
    } catch {}
    await delay(250);
  }

  if (Date.now() >= deadline) {
    server.kill();
    throw new Error("Timed out waiting for the E2E server");
  }

  return async () => {
    if (server.exitCode !== null) return;
    server.kill();
    await Promise.race([
      new Promise<void>((resolve) => server.once("exit", () => resolve())),
      delay(2_000),
    ]);
  };
}
