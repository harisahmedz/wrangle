import * as Sentry from "@sentry/nextjs";
import { config as zodConfig } from "zod";
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

// Zod 4 probes `new Function("")` on its first object parse to pick a JIT
// fast path. The enforced CSP (proxy.ts) has no 'unsafe-eval', so the probe
// is caught but still reported as a violation; `jitless` skips it. Set here
// because this file runs before any app code on the client.
zodConfig({ jitless: true });

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
