import { describe, expect, it } from "vitest";
import {
  canChangeRole,
  canGrantRole,
  canInvite,
  canLeave,
  canRemoveMember,
  canTransferOwnership,
} from "@/lib/sharing/permissions";

describe("sharing permissions matrix", () => {
  it("only admin+ can invite", () => {
    expect(canInvite("viewer")).toBe(false);
    expect(canInvite("member")).toBe(false);
    expect(canInvite("admin")).toBe(true);
    expect(canInvite("owner")).toBe(true);
  });

  it("never grants owner via invite; admin grant needs owner", () => {
    expect(canGrantRole("admin", "admin")).toBe(false);
    expect(canGrantRole("owner", "admin")).toBe(true);
    expect(canGrantRole("admin", "member")).toBe(true);
    expect(canGrantRole("admin", "viewer")).toBe(true);
    expect(canGrantRole("owner", "owner")).toBe(false);
  });

  it("role changes: owner any; admin only downward targets", () => {
    expect(canChangeRole("owner", "admin", "member")).toBe(true);
    expect(canChangeRole("admin", "member", "viewer")).toBe(true);
    expect(canChangeRole("admin", "admin", "member")).toBe(false);
    expect(canChangeRole("admin", "member", "admin")).toBe(false);
    expect(canChangeRole("member", "viewer", "member")).toBe(false);
  });

  it("removal needs strictly higher rank than target; owner untouchable", () => {
    expect(canRemoveMember("owner", "admin")).toBe(true);
    expect(canRemoveMember("owner", "owner")).toBe(false);
    expect(canRemoveMember("admin", "member")).toBe(true);
    expect(canRemoveMember("admin", "admin")).toBe(false);
    expect(canRemoveMember("member", "member")).toBe(false);
  });

  it("leave and transfer rules", () => {
    expect(canLeave("owner")).toBe(false);
    expect(canLeave("member")).toBe(true);
    expect(canTransferOwnership("owner")).toBe(true);
    expect(canTransferOwnership("admin")).toBe(false);
  });
});
