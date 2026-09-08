"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function SwSessionScope({
  userId,
  expires,
}: {
  userId: string;
  expires: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }
    void navigator.serviceWorker.ready.then((registration) => {
      const worker = navigator.serviceWorker.controller ?? registration.active;
      worker?.postMessage({
        type: "SET_CACHE_SCOPE",
        scope: userId,
        expires,
        url: window.location.href,
      });
    });
  }, [expires, pathname, userId]);

  return null;
}
