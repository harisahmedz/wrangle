"use client";

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
      <h2 className="text-lg font-semibold">That broke.</h2>
      <p className="max-w-sm text-sm text-muted">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
      >
        Try again
      </button>
    </div>
  );
}
