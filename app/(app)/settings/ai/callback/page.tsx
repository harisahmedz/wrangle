import type { Metadata } from "next";
import { requireUser } from "@/lib/authz";
import { AiCallback } from "@/components/settings/ai-callback";

export const metadata: Metadata = { title: "Connecting OpenRouter" };

// OpenRouter redirects here with `?code=…&state=…` (lib/ai/pkce.ts). The page
// is a shell: the exchange happens in the browser and the key never reaches
// this server, so nothing here reads `code` beyond passing it down.
export default async function AiCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  return <AiCallback code={one(params.code)} state={one(params.state)} />;
}
