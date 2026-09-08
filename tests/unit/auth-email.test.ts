import { describe, expect, it } from "vitest";
import { hasVerifiedOAuthEmail } from "@/lib/auth-email";

describe("hasVerifiedOAuthEmail", () => {
  it("accepts verified Google and GitHub profiles", () => {
    expect(hasVerifiedOAuthEmail("google", { email_verified: true })).toBe(true);
    expect(hasVerifiedOAuthEmail("github", { email_verified: true })).toBe(true);
  });

  it("rejects missing, unverified, and unknown provider profiles", () => {
    expect(hasVerifiedOAuthEmail("google", { email_verified: false })).toBe(false);
    expect(hasVerifiedOAuthEmail("github", {})).toBe(false);
    expect(hasVerifiedOAuthEmail("other", { email_verified: true })).toBe(false);
  });
});
