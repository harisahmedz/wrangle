"use client";

import { useEffect, useState } from "react";

// The offline pill moved to the outbox provider (lib/outbox/client.tsx, V2
// S8), which is the one source of truth for `offline` inside the app shell.
export function SwRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((r) => {
          r.addEventListener("updatefound", () => {
            const sw = r.installing;
            if (!sw) return;
            sw.addEventListener("statechange", () => {
              if (
                sw.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setUpdateReady(true);
              }
            });
          });
        })
        .catch(() => {});
    }
  }, []);

  const applyUpdate = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.waiting?.postMessage("SKIP_WAITING");
    setTimeout(() => window.location.reload(), 150);
  };

  return (
    <>
      {updateReady && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-[95] flex justify-center px-4 md:bottom-6"
        >
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-lg">
            <span>Update available</span>
            <button
              onClick={() => void applyUpdate()}
              className="font-semibold text-accent-strong hover:underline"
            >
              Reload
            </button>
          </div>
        </div>
      )}
    </>
  );
}
