"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ROUTES: Record<string, string> = {
  t: "/today",
  b: "/boards",
  m: "/money",
  l: "/learn",
  s: "/shutdown",
  w: "/weekly",
};

export function Hotkeys() {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable))
      ) {
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"]',
        );
        if (search) search.focus();
        return;
      }

      if (e.key === "n") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("wrangle-quickadd"));
        return;
      }

      const route = ROUTES[e.key.toLowerCase()];
      if (route) router.push(route);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <div className="pointer-events-none fixed bottom-2 right-3 z-[10] hidden gap-3 text-[10px] text-muted lg:flex">
      <span><kbd>T</kbd> today</span>
      <span><kbd>B</kbd> boards</span>
      <span><kbd>M</kbd> money</span>
      <span><kbd>L</kbd> learn</span>
      <span><kbd>S</kbd> shutdown</span>
      <span><kbd>W</kbd> week</span>
      <span><kbd>N</kbd> new</span>
      <span><kbd>/</kbd> search</span>
    </div>
  );
}
