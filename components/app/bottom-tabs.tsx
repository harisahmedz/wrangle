"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BoardsIcon,
  LearnIcon,
  MoneyIcon,
  PlusIcon,
  TodayIcon,
} from "@/components/icons";
import { QuickAddSheet } from "@/components/kanban/quick-add";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/today", label: "Today", icon: TodayIcon },
  { href: "/boards", label: "Boards", icon: BoardsIcon },
  { href: "/money", label: "Money", icon: MoneyIcon },
  { href: "/learn", label: "Learn", icon: LearnIcon },
];

export function BottomTabs({
  quickPrefill,
  quickAutoOpen = false,
}: {
  quickPrefill?: string;
  quickAutoOpen?: boolean;
}) {
  const pathname = usePathname();

  return (
    <>
      <button
        onClick={() =>
          window.dispatchEvent(new CustomEvent("wrangle-quickadd"))
        }
        aria-label="Quick add task"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+64px)] left-1/2 z-30 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition-transform active:scale-95 md:hidden"
      >
        <PlusIcon className="h-6 w-6" />
      </button>

      <QuickAddSheet
        key={quickPrefill ?? ""}
        defaultOpen={quickAutoOpen}
        initialTitle={quickPrefill}
      />

      <nav
        aria-label="Primary"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-surface md:hidden"
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
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
