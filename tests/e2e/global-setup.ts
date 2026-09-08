import { spawn } from "node:child_process";
import { join } from "node:path";

const HEALTH_URL = "http://127.0.0.1:3100/api/health";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function globalSetup() {
  try {
    const existing = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(500) });
    if (existing.ok) throw new Error("Port 3100 is already in use");
  } catch (error) {
    if (error instanceof Error && error.message === "Port 3100 is already in use") {
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
  const server = spawn(process.execPath, [nextBin, "start", "-p", "3100"], {
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
