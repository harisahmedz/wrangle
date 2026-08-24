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

  const reload = () => {
    reset();
    window.location.reload();
  };

  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: light)'),t=null;try{t=localStorage.getItem('wrangle-theme')}catch(e){}d.classList.toggle('light',t==='light'||(t!=='dark'&&m.matches))}catch(e){}`,
          }}
        />
      </head>
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
