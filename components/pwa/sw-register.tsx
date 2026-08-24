"use client";

import { useEffect, useState } from "react";

export function SwRegister() {
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    setTimeout(() => setOffline(!navigator.onLine), 0);
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

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

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const applyUpdate = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.waiting?.postMessage("SKIP_WAITING");
    setTimeout(() => window.location.reload(), 150);
  };

  return (
    <>
      {offline && (
        <div
          role="status"
          className="fixed inset-x-0 top-14 z-[90] flex justify-center px-4"
        >
          <p className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs shadow-lg">
            ⚡ Offline — showing your saved pages
          </p>
        </div>
      )}
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
