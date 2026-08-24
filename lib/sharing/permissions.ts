import type { ProjectRole } from "@/db/schema";

export const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export const INVITEABLE_ROLES = ["viewer", "member", "admin"] as const;
export type InviteableRole = (typeof INVITEABLE_ROLES)[number];

export function canInvite(actor: ProjectRole): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK.admin;
}

export function canGrantRole(
  actor: ProjectRole,
  roleToGrant: ProjectRole,
): boolean {
  if (!canInvite(actor)) return false;
  if (roleToGrant === "owner") return false;
  if (roleToGrant === "admin") return actor === "owner";
  return true;
}

export function canChangeRole(
  actor: ProjectRole,
  target: ProjectRole,
  next: ProjectRole,
): boolean {
  if (next === "owner") return false;
  if (next === "admin") return actor === "owner";
  if (actor === "owner") return true;
  return (
    ROLE_RANK[actor] >= ROLE_RANK.admin && ROLE_RANK[target] < ROLE_RANK[actor]
  );
}

export function canRemoveMember(
  actor: ProjectRole,
  target: ProjectRole,
): boolean {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

export function canLeave(role: ProjectRole): boolean {
  return role !== "owner";
}

export function canTransferOwnership(role: ProjectRole): boolean {
  return role === "owner";
}
