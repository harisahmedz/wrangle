import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  sourcemaps: {
    disable: true,
  },
  silent: !process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
});
