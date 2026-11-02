import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

describe("scrubBreadcrumb", () => {
  it("keeps only host, method and status for openrouter.ai calls", () => {
    const out = scrubBreadcrumb({
      category: "fetch",
      type: "http",
      data: {
        url: "https://openrouter.ai/api/v1/chat/completions?x=1",
        method: "POST",
        status_code: 401,
        request_body_size: 812,
        body: '{"messages":[]}',
      },
    });
    expect(out.data).toEqual({
      url: "https://openrouter.ai/",
      method: "POST",
      status_code: 401,
    });
    expect(out.category).toBe("fetch");
  });

  it("leaves other breadcrumbs untouched", () => {
    const crumb = {
      category: "fetch",
      data: { url: "/api/outbox", method: "POST", status_code: 200 },
    };
    expect(scrubBreadcrumb(crumb)).toBe(crumb);
    const ui = { category: "ui.click", message: "button" };
    expect(scrubBreadcrumb(ui)).toBe(ui);
  });
});

describe("scrubEvent", () => {
  it("drops Authorization headers in any casing, keeps the rest", () => {
    const event = {
      type: undefined,
      request: {
        url: "https://wrangle.app/today",
        headers: {
          Authorization: "Bearer sk-or-v1-secret",
          authorization: "Bearer again",
          "User-Agent": "test",
        },
      },
    } as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request?.headers).toEqual({ "User-Agent": "test" });
  });

  it("tolerates events without a request", () => {
    const event = { type: undefined, message: "boom" } as ErrorEvent;
    expect(scrubEvent(event)).toBe(event);
  });
});
