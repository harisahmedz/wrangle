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
      position: projects.position,
    })
    .from(memberships)
    .innerJoin(projects, eq(memberships.projectId, projects.id))
    .where(
      and(
        eq(memberships.userId, session.user.id),
        isNull(projects.deletedAt),
      ),
    )
    .orderBy(asc(projects.position));

  return (
    <ToastProvider>
      <TopBar
        name={session.user.name}
        image={session.user.image}
        left={<MobileProjectsDrawer projects={myProjects} />}
      />
      <div className="flex flex-1">
        <main className="flex-1 overflow-x-hidden px-4 py-6 pb-28 md:px-8 md:pb-8">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
        <SideProjects projects={myProjects} />
      </div>
      <BottomTabs />
      <Hotkeys />
    </ToastProvider>
  );
}
