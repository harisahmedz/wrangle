"use client";

// Step 2+3 of the OpenRouter PKCE flow (lib/ai/pkce.ts): exchange the code in
// the browser, store the key on this device, go back to Settings.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonStyles } from "@/components/ui/button";

export function AiCallback({ code, state }: { code: string | null; state: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // The stash is single-use, so the exchange must run exactly once per mount
  // even under React's dev-only double effect invocation.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    import("@/lib/ai/pkce")
      .then((m) => m.finishConnect({ code, state }))
      .then((r) => {
        if (r.ok) router.replace("/settings");
        else setError(r.error);
      })
      .catch(() => setError("Could not finish connecting."));
  }, [code, state, router]);

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-xl border border-border bg-surface p-6">
      <h1 className="font-semibold">{error ? "OpenRouter wasn't connected" : "Connecting OpenRouter…"}</h1>
      <p className="text-sm text-muted" role="status">
        {error ?? "Finishing the sign-in and storing the key on this device."}
      </p>
      {error && (
        <Link href="/settings" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Back to Settings
        </Link>
      )}
    </div>
  );
}
