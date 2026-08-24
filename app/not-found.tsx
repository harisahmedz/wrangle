import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-4xl" aria-hidden>
        🧭
      </span>
      <h1 className="text-xl font-bold">Nothing here</h1>
      <p className="max-w-sm text-sm text-muted">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link
        href="/today"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
      >
        Back to Today
      </Link>
    </main>
  );
}
