import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

// Zod 4 probes `new Function("")` on its first object parse to pick a JIT
// fast path. The enforced CSP (proxy.ts) has no 'unsafe-eval', so the probe
// is caught but still reported as a violation; `jitless` skips it. Set here
// because this file runs before any app code on the client. Zod keeps its
// config on this global and adopts an existing one, so importing zod's
// `config` (~5 KB gzip on every route) isn't needed (V3 S8b; pinned by
// tests/unit/zod-jitless.test.ts).
const zodGlobal = globalThis as { __zod_globalConfig?: { jitless?: boolean } };
(zodGlobal.__zod_globalConfig ??= {}).jitless = true;

// Sentry (~69 KB gzip) loads only when a DSN is set (V3 S8b). The DSN is
// inlined at build time, so without one this branch and its chunk are gone.
// Errors thrown before the chunk arrives are not reported.
type Sentry = typeof import("@sentry/nextjs");
let captureTransition: Sentry["captureRouterTransitionStart"] | undefined;

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
    captureTransition = Sentry.captureRouterTransitionStart;
  });
}

export function onRouterTransitionStart(
  ...args: Parameters<Sentry["captureRouterTransitionStart"]>
) {
  captureTransition?.(...args);
}
