"use client";

import { useEffect } from "react";

export function QuickAddTrigger({ prefill }: { prefill: string }) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("wrangle-quickadd", { detail: prefill }),
    );
    const url = new URL(window.location.href);
    ["quick", "title", "text", "link"].forEach((p) => url.searchParams.delete(p));
    window.history.replaceState(null, "", url.toString());
  }, [prefill]);
  return null;
}

export function ExpenseAddTrigger() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("wrangle-expense-add"));
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState(null, "", url.toString());
  }, []);
  return null;
}
