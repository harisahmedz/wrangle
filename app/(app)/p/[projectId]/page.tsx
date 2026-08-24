import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/authz";

type Props = { params: Promise<{ projectId: string }> };

export const metadata: Metadata = { title: "Project" };

const KINDS = ["todo", "ideas", "work"] as const;

export default async function ProjectPage({ params }: Props) {
  const { projectId } = await params;
  await requireMembership(projectId);

  const cookieStore = await cookies();
  const remembered = cookieStore.get("wrangle-last-board")?.value ?? "";
  const [rememberedProject, rememberedKind] = remembered.split(":");
  const target =
    rememberedProject === projectId &&
    KINDS.includes(rememberedKind as (typeof KINDS)[number])
      ? rememberedKind
      : "todo";

  redirect(`/p/${projectId}/b/${target}`);
}
