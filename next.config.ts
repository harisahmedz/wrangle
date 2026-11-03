import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

// The Content-Security-Policy itself is set per request in proxy.ts (V3 S0c):
// its script-src carries a nonce, which a static header can't.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Redundant with the CSP's `frame-ancestors 'none'` (proxy.ts); kept for
  // the responses the proxy doesn't cover and for old browsers.
  { key: "X-Frame-Options", value: "DENY" },
  // The Dump's Web Speech capture (lib/dump/use-speech.ts) needs the mic;
  // nothing in the app uses camera/geolocation.
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(self)",
  },
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
  turbopack: {
    resolveAlias: {
      // The voice worker (lib/voice/worker.ts) runs ONNX Runtime's wasm backend
      // only (VOICE_DEVICE in lib/voice/model.ts). transformers.js imports the
      // webgpu entry, whose own asset references would also emit a 27 MB
      // `asyncify` wasm nothing fetches. Drop this alias when enabling WebGPU.
      "onnxruntime-web/webgpu": "onnxruntime-web/wasm",
    },
  },
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
