import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown", () => {
  it("renders basic markdown to safe html", () => {
    const html = renderMarkdown("**bold** and _em_");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>em</em>");
  });

  it("strips script tags and inline event handlers", () => {
    const html = renderMarkdown(
      'hello <script>alert(1)</script><img src=x onerror=alert(1)> world',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).toContain("world");
  });

  it("strips javascript: urls and hardens links", () => {
    const html = renderMarkdown("[x](javascript:alert(1)) [y](https://a.b)");
    expect(html).not.toContain("javascript:");
    expect(html).toMatch(/rel="[^"]*noopener/);
    expect(html).toContain('href="https://a.b"');
  });

  it("returns empty string for null", () => {
    expect(renderMarkdown(null)).toBe("");
  });
});
