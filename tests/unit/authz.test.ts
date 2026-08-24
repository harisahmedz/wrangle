import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const rows: Array<{ role: string }> = [];
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => rows,
  };
  return {
    rows,
    chain,
    auth: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
    notFound: vi.fn(() => {
      throw new Error("NOT_FOUND");
    }),
  };
});

vi.mock("@/auth", () => ({ auth: h.auth }));
vi.mock("@/db", () => ({ db: { select: () => h.chain } }));
vi.mock("next/navigation", () => ({
  redirect: h.redirect,
  notFound: h.notFound,
}));

import { hasMinRole, requireMembership } from "@/lib/authz";

beforeEach(() => {
  h.rows.length = 0;
  h.auth.mockReset();
});

describe("hasMinRole", () => {
  it("ranks roles correctly", () => {
    expect(hasMinRole("owner", "admin")).toBe(true);
    expect(hasMinRole("admin", "admin")).toBe(true);
    expect(hasMinRole("member", "admin")).toBe(false);
    expect(hasMinRole("admin", "owner")).toBe(false);
    expect(hasMinRole("viewer", "viewer")).toBe(true);
    expect(hasMinRole("viewer", "member")).toBe(false);
    expect(hasMinRole("member", "viewer")).toBe(true);
  });
});

describe("requireMembership", () => {
  it("redirects to signin when there is no session", async () => {
    h.auth.mockResolvedValue(null);
    await expect(requireMembership("p1")).rejects.toThrow("REDIRECT:/signin");
  });

  it("404s a stranger who is not a member", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1" } });
    h.rows.length = 0;
    await expect(requireMembership("p1")).rejects.toThrow("NOT_FOUND");
    expect(h.notFound).toHaveBeenCalled();
  });

  it("404s when role is below the minimum", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1" } });
    h.rows.push({ role: "viewer" });
    await expect(requireMembership("p1", "member")).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("returns membership context for an authorized member", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1" } });
    h.rows.push({ role: "admin" });
    await expect(requireMembership("p1", "member")).resolves.toEqual({
      userId: "u1",
      projectId: "p1",
      role: "admin",
    });
  });
});
