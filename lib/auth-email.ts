export function hasVerifiedOAuthEmail(
  provider: string | undefined,
  profile: unknown,
): boolean {
  if (provider !== "google" && provider !== "github") return false;
  if (!profile || typeof profile !== "object") return false;
  return (profile as { email_verified?: unknown }).email_verified === true;
}
