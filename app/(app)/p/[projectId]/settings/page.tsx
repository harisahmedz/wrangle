import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { hasMinRole, requireMembership } from "@/lib/authz";
import { ProjectSettingsForm } from "@/components/projects/project-settings-form";
import { DangerZone } from "@/components/projects/danger-zone";

type Props = { params: Promise<{ projectId: string }> };

export const metadata: Metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({ params }: Props) {
  const { projectId } = await params;
  const ctx = await requireMembership(projectId, "admin");

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);

  if (!project) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/p/${project.id}`}
          className="text-sm text-muted hover:text-text"
        >
          ← Back to project
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Project settings
        </h1>
      </div>

      <section>
        <h2 className="mb-4 font-semibold">General</h2>
        <ProjectSettingsForm
          projectId={project.id}
          name={project.name}
          emoji={project.emoji ?? "📁"}
          color={project.color ?? "#8b5cf6"}
        />
      </section>

      <DangerZone
        projectId={project.id}
        projectName={project.name}
        isPersonal={project.isPersonal}
        isArchived={project.archivedAt !== null}
      />

      {!hasMinRole(ctx.role, "owner") && (
        <p className="text-xs text-muted">
          You manage this project as an admin. Only the owner can delete it.
        </p>
      )}
    </div>
  );
}
