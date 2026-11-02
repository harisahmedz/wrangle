"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  BoardsIcon,
  LearnIcon,
  MoneyIcon,
  PlusIcon,
  TodayIcon,
} from "@/components/icons";
import { onIdle } from "@/lib/client/idle";
import { cn } from "@/lib/utils";

// Quick Add and the Dump (with chrono-node and the Dump parser) load on their
// first open event instead of with the shell (V3 S8b), and are warmed on idle
// so they still open offline. The event that triggered the load, or the last
// one fired while the chunk was loading, is replayed by `withReplay` once the
// sheet has registered its own listener (child effects run first).
type Take = () => CustomEvent | null;

function withReplay<P extends object>(Sheet: ComponentType<P>) {
  return function Replayed({ take, ...props }: P & { take: Take }) {
    useEffect(() => {
      const e = take();
      if (e) window.dispatchEvent(new CustomEvent(e.type, { detail: e.detail }));
    }, [take]);
    return <Sheet {...(props as P)} />;
  };
}

const importQuickAdd = () => import("@/components/kanban/quick-add");
const importDump = () => import("@/components/dump/dump-sheet");
const QuickAddSheet = dynamic(() => importQuickAdd().then((m) => withReplay(m.QuickAddSheet)), {
  ssr: false,
});
const DumpSheet = dynamic(() => importDump().then((m) => withReplay(m.DumpSheet)), {
  ssr: false,
});

/** Mounts a lazy sheet on its first `event` and hands that event to it. */
function useLazySheet(event: string, mountNow: boolean) {
  const [mounted, setMounted] = useState(mountNow);
  const ref = useRef({ live: false, pending: null as CustomEvent | null });
  useEffect(() => {
    const onEvent = (e: Event) => {
      if (ref.current.live) return;
      ref.current.pending = e as CustomEvent;
      setMounted(true);
    };
    window.addEventListener(event, onEvent);
    return () => window.removeEventListener(event, onEvent);
  }, [event]);
  const take = useCallback<Take>(() => {
    ref.current.live = true;
    const e = ref.current.pending;
    ref.current.pending = null;
    return e;
  }, []);
  return { mounted, take };
}

const tabs = [
  {
    href: "/today",
    label: "Today",
    icon: TodayIcon,
    matches: ["/today", "/upcoming", "/shutdown", "/weekly", "/wrapped"],
  },
  {
    href: "/boards",
    label: "Boards",
    icon: BoardsIcon,
    matches: ["/boards", "/p", "/trash"],
  },
  { href: "/money", label: "Money", icon: MoneyIcon, matches: ["/money"] },
  { href: "/learn", label: "Learn", icon: LearnIcon, matches: ["/learn"] },
];

export function BottomTabs({
  quickPrefill,
  quickAutoOpen = false,
}: {
  quickPrefill?: string;
  quickAutoOpen?: boolean;
}) {
  const pathname = usePathname();
  // Shutdown has its own full-width primary action; the FAB would sit on top of it.
  const hideQuickAdd = pathname.startsWith("/shutdown");
  const holdRef = useRef({ timer: null as number | null, fired: false, x: 0, y: 0 });
  const quick = useLazySheet("wrangle-quickadd", quickAutoOpen);
  const dump = useLazySheet("wrangle-dump", false);

  useEffect(
    () =>
      onIdle(() => {
        void importQuickAdd();
        void importDump();
      }),
    [],
  );

  const cancelHold = () => {
    const hold = holdRef.current;
    if (hold.timer !== null) {
      window.clearTimeout(hold.timer);
      hold.timer = null;
    }
  };

  return (
    <>
      {!hideQuickAdd && (
      <button
        onPointerDown={(e) => {
          const hold = holdRef.current;
          cancelHold();
          hold.fired = false;
          hold.x = e.clientX;
          hold.y = e.clientY;
          hold.timer = window.setTimeout(() => {
            hold.timer = null;
            hold.fired = true;
            window.dispatchEvent(new CustomEvent("wrangle-dump"));
          }, 450);
        }}
        onPointerMove={(e) => {
          const hold = holdRef.current;
          if (hold.timer === null) return;
          if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) cancelHold();
        }}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onClick={() => {
          const hold = holdRef.current;
          if (hold.fired) {
            hold.fired = false;
            return;
          }
          window.dispatchEvent(new CustomEvent("wrangle-quickadd"));
        }}
        aria-label="Quick add task — hold for the Dump"
        title="Tap to quick-add · hold to open the Dump"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+64px)] left-1/2 z-30 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition-transform active:scale-95 md:hidden"
      >
        <PlusIcon className="h-6 w-6" />
      </button>
      )}

      {quick.mounted && (
        <QuickAddSheet
          key={quickPrefill ?? ""}
          defaultOpen={quickAutoOpen}
          initialTitle={quickPrefill}
          take={quick.take}
        />
      )}

      {dump.mounted && <DumpSheet take={dump.take} />}

      <nav
        aria-label="Primary"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-surface md:hidden"
      >
        {tabs.map(({ href, label, icon: Icon, matches }) => {
          const active = matches.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
          );
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-[11px] transition-colors",
                active ? "text-accent-strong" : "text-muted",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.2]")} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
