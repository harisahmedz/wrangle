"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ProjectNav, type SidebarProject } from "@/components/app/project-nav";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";
import { Sheet } from "@/components/ui/dialog";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { toggleSidebarCollapsed } from "@/lib/sidebar";
import { cn } from "@/lib/utils";
import {
  BoardsIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LearnIcon,
  LinesIcon,
  MoneyIcon,
  PlusIcon,
  ShutdownIcon,
  TodayIcon,
  WeeklyIcon,
} from "@/components/icons";

const NAV_ITEMS = [
  { href: "/today", label: "Today", icon: TodayIcon, matches: ["/today"] },
  { href: "/upcoming", label: "Upcoming", icon: CalendarIcon, matches: ["/upcoming"] },
  { href: "/boards", label: "Boards", icon: BoardsIcon, matches: ["/boards", "/p"] },
  { href: "/money", label: "Money", icon: MoneyIcon, matches: ["/money"] },
  { href: "/learn", label: "Learn", icon: LearnIcon, matches: ["/learn"] },
  {
    href: "/shutdown",
    label: "Shutdown",
    icon: ShutdownIcon,
    matches: ["/shutdown"],
  },
  { href: "/weekly", label: "Weekly", icon: WeeklyIcon, matches: ["/weekly"] },
];

// Decoupled from the toggle button so it can live in the slim top bar while
// the overlay itself renders next to <main> — same event-bus pattern as
// wrangle-quickadd/wrangle-dump.
const OVERLAY_EVENT = "wrangle-sidebar-overlay";

function AddTaskButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("wrangle-quickadd"))}
      className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium text-accent-strong transition-colors hover:bg-surface-2"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
        <PlusIcon className="h-3.5 w-3.5" />
      </span>
      Add task
    </button>
  );
}

function NavList({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon, matches }) => {
        const active = matches.some(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
        );
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
              active
                ? "bg-accent/15 font-medium text-accent-strong"
                : "text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({
  projects,
  pathname,
  onNavigate,
  onRequestNewProject,
}: {
  projects: SidebarProject[];
  pathname: string;
  onNavigate?: () => void;
  onRequestNewProject?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <AddTaskButton />
      <NavList pathname={pathname} onNavigate={onNavigate} />
      <ProjectNav
        projects={projects}
        onNavigate={onNavigate}
        onRequestNewProject={onRequestNewProject}
      />
    </div>
  );
}

/** Opens the full-content overlay sidebar; rendered inside the slim top bar at md-lg. */
export function SidebarToggleButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent(OVERLAY_EVENT))}
      aria-label="Open sidebar"
      className="hidden h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text md:flex lg:hidden"
    >
      <LinesIcon className="h-5 w-5" />
    </button>
  );
}

const SIDEBAR_ID = "app-sidebar";

export function Sidebar({
  projects,
  name,
  image,
}: {
  projects: SidebarProject[];
  name?: string | null;
  image?: string | null;
}) {
  const pathname = usePathname();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const collapseBtnRef = useRef<HTMLButtonElement>(null);
  const expandBtnRef = useRef<HTMLButtonElement>(null);

  // Sync the aria/focus-only `collapsed` state from the real (CSS-driving)
  // class after mount — the class itself stays the single source of truth
  // for the no-flash visual (server always renders `false`, matching the
  // pre-hydration default, so there's no visual flash from this one-time
  // correction), this just keeps aria-expanded honest.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of an external (localStorage-backed) DOM class on mount, not a derivable render value
    setCollapsed(document.documentElement.classList.contains("sidebar-collapsed"));
  }, []);

  useEffect(() => {
    const onToggle = () => setOverlayOpen(true);
    // Quick Add is its own focus-trapped Sheet; opening it on top of the
    // still-open tablet overlay (from the "Add task" row or the `n` hotkey)
    // would fight it for Escape/focus-trap, so close the overlay first.
    const onQuickAdd = () => setOverlayOpen(false);
    window.addEventListener(OVERLAY_EVENT, onToggle);
    window.addEventListener("wrangle-quickadd", onQuickAdd);
    return () => {
      window.removeEventListener(OVERLAY_EVENT, onToggle);
      window.removeEventListener("wrangle-quickadd", onQuickAdd);
    };
  }, []);

  useEffect(() => {
    // Rotating an open tablet-portrait overlay into the pinned-sidebar width
    // would otherwise leave its backdrop/scroll-lock/focus-trap stuck on.
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOverlayOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const handleToggleCollapsed = () => {
    toggleSidebarCollapsed();
    const next = !collapsed;
    setCollapsed(next);
    (next ? expandBtnRef : collapseBtnRef).current?.focus();
  };

  return (
    <>
      {/* Pinned left sidebar, >=1024px. Collapse is a pure-CSS class toggle on
          <html> (see lib/sidebar.ts) so there's no flash on load. */}
      <aside
        id={SIDEBAR_ID}
        style={{
          // `--wco-offset` is 0 outside Window Controls Overlay mode (V2 S7,
          // see app/globals.css) so the header row below isn't drawn under
          // the installed desktop app's own min/max/close buttons.
          paddingTop: "calc(0.75rem + env(safe-area-inset-top) + var(--wco-offset))",
          paddingLeft: "calc(0.75rem + env(safe-area-inset-left))",
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
        className="hidden w-[264px] shrink-0 flex-col border-r border-border bg-sidebar pr-3 lg:sticky lg:top-0 lg:flex lg:h-dvh [html.sidebar-collapsed_&]:lg:hidden"
      >
        <div className="mb-3 flex items-center justify-between gap-1">
          <UserMenu name={name} image={image} align="left" showName />
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <button
              ref={collapseBtnRef}
              onClick={handleToggleCollapsed}
              aria-label="Collapse sidebar"
              aria-expanded={!collapsed}
              aria-controls={SIDEBAR_ID}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <SidebarBody projects={projects} pathname={pathname} />
      </aside>

      {/* Restore button, shown top-left of the content column only while collapsed. */}
      <button
        ref={expandBtnRef}
        onClick={handleToggleCollapsed}
        aria-label="Expand sidebar"
        aria-expanded={!collapsed}
        aria-controls={SIDEBAR_ID}
        style={{
          top: "calc(env(safe-area-inset-top) + var(--wco-offset) + 0.5rem)",
          left: "calc(env(safe-area-inset-left) + 0.5rem)",
        }}
        className="fixed z-30 hidden h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted hover:bg-surface-2 hover:text-text [html.sidebar-collapsed_&]:lg:flex"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>

      {/* Tablet-portrait overlay (md-lg): same body, reached via SidebarToggleButton. */}
      <Sheet
        open={overlayOpen}
        onClose={() => setOverlayOpen(false)}
        variant="side"
        label="Menu"
        className="lg:hidden"
      >
        <SidebarBody
          projects={projects}
          pathname={pathname}
          onNavigate={() => setOverlayOpen(false)}
          onRequestNewProject={() => {
            setOverlayOpen(false);
            setNewProjectOpen(true);
          }}
        />
      </Sheet>

      {/* Hosted outside the overlay Sheet so it survives the sheet closing
          and the post-create router.push (see project-nav.tsx). */}
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </>
  );
}
