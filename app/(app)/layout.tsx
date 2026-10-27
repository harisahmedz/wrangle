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
import { SIDEBAR_COLLAPSED_KEY } from "@/lib/sidebar";
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
    </ToastProvider>
  );
}
