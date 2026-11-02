import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

// V3 S0c (docs/ROADMAP-V3.md §4.1). The user's OpenRouter key lives only in
// the browser and travels as an Authorization header straight to
// openrouter.ai; nothing about those calls beyond "it happened, with this
// status" may reach Sentry, and no Authorization header may, from anywhere.

const OPENROUTER = "https://openrouter.ai/";

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const url = breadcrumb.data?.url;
  if (
    (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") &&
    typeof url === "string" &&
    url.startsWith(OPENROUTER)
  ) {
    return {
      ...breadcrumb,
      data: {
        url: OPENROUTER,
        method: breadcrumb.data?.method,
        status_code: breadcrumb.data?.status_code,
      },
    };
  }
  return breadcrumb;
}

export function scrubEvent<E extends ErrorEvent>(event: E): E {
  const headers = event.request?.headers;
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "authorization") delete headers[key];
    }
  }
  return event;
}
