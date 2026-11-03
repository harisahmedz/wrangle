// Share target fallback (ROADMAP-V3 §7, S7). The manifest's share_target POSTs
// here; normally public/sw.js answers before the request leaves the device,
// stashing any audio file for the Dump. This handler only runs when no service
// worker controls the page yet. It forwards the text fields the way the old GET
// target did and never reads the audio, which is dropped with the request.
import { NextResponse } from "next/server";

const TEXT_FIELDS: [string, string][] = [
  ["title", "title"],
  ["text", "text"],
  ["url", "link"],
];

export async function POST(request: Request) {
  const target = new URL("/today", request.url);
  try {
    const form = await request.formData();
    for (const [from, to] of TEXT_FIELDS) {
      const value = form.get(from);
      if (typeof value === "string" && value) target.searchParams.set(to, value.slice(0, 1000));
    }
  } catch {}
  return NextResponse.redirect(target, 303);
}

export function GET(request: Request) {
  return NextResponse.redirect(new URL("/today", request.url), 303);
}
