"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // This page replaces the root layout and its no-flash theme script. Under
  // the enforced CSP (proxy.ts) an inline script needs the request nonce,
  // which a client component can't read, so apply the theme on mount; a brief
  // flash on an error page is acceptable.
  useEffect(() => {
    try {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem("wrangle-theme");
      } catch {}
      document.documentElement.classList.toggle(
        "light",
        stored === "light" ||
          (stored !== "dark" &&
            window.matchMedia("(prefers-color-scheme: light)").matches),
      );
    } catch {}
  }, []);

  const reload = () => {
    reset();
    window.location.reload();
  };

  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="flex min-h-dvh items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-lg">
          <span className="text-4xl" aria-hidden>
            💥
          </span>
          <h2 className="mt-4 text-lg font-semibold">That broke.</h2>
          <p className="mt-2 text-sm text-muted">
            Reload the page. If it keeps happening, it&apos;s not you, it&apos;s
            us.
          </p>
          <button
            onClick={reload}
            className="mt-5 min-h-[44px] rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
