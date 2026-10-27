import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "@/components/app/top-bar";
import { MobileProjectsDrawer } from "@/components/app/mobile-drawer";
import {
  Sidebar,
  SidebarToggleButton,
} from "@/components/app/sidebar";
import type { SidebarProject } from "@/components/app/project-nav";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { Hotkeys } from "@/components/app/hotkeys";
import { ToastProvider } from "@/components/ui/toast";
import { SwSessionScope } from "@/components/pwa/sw-session-scope";
import { PullToRefresh } from "@/components/pwa/pull-to-refresh";
import { AppBadge } from "@/components/pwa/app-badge";
import { SIDEBAR_COLLAPSED_KEY } from "@/lib/sidebar";
import { todayWindow } from "@/lib/dates";
import { countDueOrOverdueCards } from "@/lib/kanban/due-cards";
import { db } from "@/db";
import { memberships, projects } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const myProjects: SidebarProject[] = await db
    .select({
      id: projects.id,
      name: projects.name,
      emoji: projects.emoji,
      color: projects.color,
      isPersonal: projects.isPersonal,
      archivedAt: projects.archivedAt,
      role: memberships.role,
      position: memberships.position,
    })
    .from(memberships)
    .innerJoin(projects, eq(memberships.projectId, projects.id))
    .where(
      and(
        eq(memberships.userId, session.user.id),
        isNull(projects.deletedAt),
      ),
    )
    .orderBy(asc(memberships.position));

  // App badge count (V2 S7): overdue + due today, matching Today's first
  // section, as a single COUNT. Layouts don't re-render on client
  // navigation; they do on reload and on a server action's `refresh()`
  // (e.g. completing a card), which is when the badge updates.
  const dueBadgeCount = await countDueOrOverdueCards(
    session.user.id,
    todayWindow(session.user.timezone || "UTC"),
  );

  return (
    <ToastProvider>
      {/* No-flash: apply the saved collapse preference to <html> before the
          pinned sidebar below paints (same technique as the theme script in
          app/layout.tsx). UI-only preference, defaults to open. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{document.documentElement.classList.toggle('sidebar-collapsed', localStorage.getItem('${SIDEBAR_COLLAPSED_KEY}')==='1')}catch(e){}`,
        }}
      />
      {/* Window Controls Overlay drag strip (V2 S7) — display:none outside
          `(display-mode: window-controls-overlay)`, see app/globals.css. */}
      <div className="wco-drag-strip" />
      <TopBar
        name={session.user.name}
        image={session.user.image}
        left={
          <>
            <MobileProjectsDrawer projects={myProjects} />
            <SidebarToggleButton />
          </>
        }
      />
      <div className="flex flex-1">
        <Sidebar
          projects={myProjects}
          name={session.user.name}
          image={session.user.image}
        />
        <main className="flex-1 overflow-x-hidden px-4 py-6 pb-28 md:px-8 md:pb-8">
          {/* A page opts out of the reading-width column by setting data-wide on its root. */}
          <div className="mx-auto max-w-4xl has-[[data-wide]]:max-w-none">
            {children}
          </div>
        </main>
      </div>
      <BottomTabs />
      <Hotkeys />
      <PullToRefresh />
      <SwSessionScope userId={session.user.id} expires={session.expires} />
      <AppBadge count={dueBadgeCount} />
    </ToastProvider>
  );
}
