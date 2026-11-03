"use client";

// Weekly and Wrapped import this, not recap-line.tsx, so the AI hook and the
// task stay out of first-load JS (V3 S8b chunk guard) and, with AI off, are
// never fetched at all.
import dynamic from "next/dynamic";
import { useAiMode } from "@/lib/ai/mode";

const RecapLine = dynamic(() => import("@/components/review/recap-line").then((m) => m.RecapLine));

export function LazyRecapLine(props: { periodId: string; period: "week" | "month"; facts: string[] }) {
  if (useAiMode() === "off") return null;
  return <RecapLine {...props} />;
}
