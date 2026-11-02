import { expect, it } from "vitest";

// instrumentation-client.ts sets zod's `jitless` through zod's own global
// (`globalThis.__zod_globalConfig`) so the client doesn't import zod at
// startup (V3 S8b). If a zod upgrade renames that global, this fails and the
// CSP `unsafe-eval` probe report comes back.
it("instrumentation-client turns on zod jitless without importing zod", async () => {
  await import("@/instrumentation-client");
  const { config } = await import("zod");
  expect(config().jitless).toBe(true);
});
