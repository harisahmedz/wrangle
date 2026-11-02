"use client";

// The board page imports this instead of card-detail.tsx so the detail sheet
// (with detail-sections) is a lazy chunk, fetched only when `?card` is set
// (V3 S8b). A server page's static client import lands in first load even
// when it isn't rendered.
import dynamic from "next/dynamic";

export const CardDetail = dynamic(() =>
  import("@/components/kanban/card-detail").then((m) => m.CardDetail),
);
