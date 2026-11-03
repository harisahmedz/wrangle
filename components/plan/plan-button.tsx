"use client";

// The "Plan my week" button on /upcoming (V3 S6). The sheet, the scheduler
// (lib/plan) and the AI task are a lazy chunk fetched on the first click, so
// none of them sit in first-load JS (ROADMAP-V3 §8; `perf.mjs --chunks`
// enforces it). `input` is server-rendered with the page so planning works
// offline too.
import dynamic from "next/dynamic";
import { useState } from "react";
import type { PlanInput } from "@/lib/plan/types";
import { Button } from "@/components/ui/button";

const PlanSheet = dynamic(() => import("@/components/plan/plan-sheet").then((m) => m.PlanSheet), {
  ssr: false,
});

export function PlanButton({ input, initialOpen = false }: { input: PlanInput; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Plan my week
      </Button>
      {open && <PlanSheet input={input} onClose={() => setOpen(false)} />}
    </>
  );
}
