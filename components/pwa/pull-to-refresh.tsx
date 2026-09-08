"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TRIGGER_DISTANCE = 72;

export function PullToRefresh() {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  const distanceRef = useRef(0);
  const [distance, setDistance] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onStart = (event: TouchEvent) => {
      const target = event.target;
      if (
        window.scrollY > 0 ||
        !(target instanceof Element) ||
        target.closest('[role="dialog"]')
      ) {
        start.current = null;
        return;
      }
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
    };

    const onMove = (event: TouchEvent) => {
      if (!start.current) return;
      const touch = event.touches[0];
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;
      if (dy <= 0 || Math.abs(dx) > dy) {
        distanceRef.current = 0;
        setDistance(0);
        return;
      }
      distanceRef.current = Math.min(dy * 0.55, 96);
      setDistance(distanceRef.current);
    };

    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      if (distanceRef.current >= TRIGGER_DISTANCE) {
        startTransition(() => router.refresh());
      }
      distanceRef.current = 0;
      setDistance(0);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const visible = pending || distance > 8;
  return (
    <div
      aria-live="polite"
      aria-label={pending ? "Refreshing" : "Pull to refresh"}
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-[90] flex justify-center transition-opacity md:hidden"
      style={{
        opacity: visible ? 1 : 0,
        transform: `translateY(${pending ? 12 : Math.max(-36, distance - 40)}px)`,
      }}
    >
      <span className="flex h-9 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted shadow-md">
        {pending
          ? "Refreshing…"
          : distance >= TRIGGER_DISTANCE
            ? "Release to refresh"
            : "Pull to refresh"}
      </span>
    </div>
  );
}
