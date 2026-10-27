import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

// Report-only for now (V2 S7): this repo has inline boot scripts (the
// no-flash theme script in app/layout.tsx, the sidebar-collapse script in
// app/(app)/layout.tsx) that a real enforcing `script-src` would need a
// nonce (via proxy.ts) or hashes for — out of scope for this slice. Shipping
// report-only first surfaces violations (Sentry, Cloudinary, OAuth avatars,
// the service worker) without risking breakage; flip to `Content-Security-
// Policy` once the reports come back clean.
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com https://avatars.githubusercontent.com",
  "font-src 'self'",
  "connect-src 'self' https://api.cloudinary.com https://*.sentry.io",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Superseded by the CSP's `frame-ancestors` above, but that directive is
  // report-only today — this is the header actually enforcing it.
  { key: "X-Frame-Options", value: "DENY" },
  // The Dump's Web Speech capture (lib/dump/use-speech.ts) needs the mic;
  // nothing in the app uses camera/geolocation.
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(self)",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Everything except the service worker script itself, so its
        // existing scope/headers are left exactly as today.
        source: "/((?!sw\\.js).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  sourcemaps: {
    disable: true,
  },
  silent: !process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
});
