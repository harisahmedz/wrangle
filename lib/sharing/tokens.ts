import { createHash, randomBytes } from "node:crypto";

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin}/join/${token}`;
}
