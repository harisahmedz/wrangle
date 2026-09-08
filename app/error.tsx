"use client";

import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/button";

export default function GlobalAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-4xl" aria-hidden>
        💥
      </span>
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="max-w-sm text-sm text-muted">
        This page hit an error while loading. Your data is safe. Try again, or
        head back to Today.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/today" className={buttonStyles({ variant: "secondary" })}>
          Back to Today
        </Link>
      </div>
      {(error.message || error.digest) && (
        <details className="w-full max-w-md text-left text-xs text-muted">
          <summary className="cursor-pointer text-center">Technical details</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-2 p-3">
            {error.message}
            {error.digest ? `\n\nRef: ${error.digest}` : ""}
          </pre>
        </details>
      )}
    </div>
  );
}
