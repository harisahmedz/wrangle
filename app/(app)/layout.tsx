import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "@/components/app/top-bar";
import {
  SideProjects,
  type SidebarProject,
} from "@/components/app/side-projects";
import { MobileProjectsDrawer } from "@/components/app/mobile-drawer";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { Hotkeys } from "@/components/app/hotkeys";
import { ToastProvider } from "@/components/ui/toast";
import { SwSessionScope } from "@/components/pwa/sw-session-scope";
import { PullToRefresh } from "@/components/pwa/pull-to-refresh";
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
      <TopBar
        name={session.user.name}
        image={session.user.image}
        left={<MobileProjectsDrawer projects={myProjects} />}
      />
      <div className="flex flex-1">
        <main className="flex-1 overflow-x-hidden px-4 py-6 pb-28 md:px-8 md:pb-8">
          {/* A page opts out of the reading-width column by setting data-wide on its root. */}
          <div className="mx-auto max-w-4xl has-[[data-wide]]:max-w-none">
            {children}
          </div>
        </main>
        <SideProjects projects={myProjects} />
      </div>
      <BottomTabs />
      <Hotkeys />
      <PullToRefresh />
      <SwSessionScope userId={session.user.id} expires={session.expires} />
    </ToastProvider>
  );
}
