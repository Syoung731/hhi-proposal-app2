import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { ProjectTabs } from "./tabs";

const TAB = "tab";

export default async function AdminProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (typeof sp[TAB] === "string" ? sp[TAB] : undefined) || "overview";

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      rooms: { orderBy: { sortOrder: "asc" } },
      media: { orderBy: { sortOrder: "asc" } },
      timelinePhases: { orderBy: { sortOrder: "asc" } },
      investmentLineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!project) notFound();
  return (
    <div>
      <div className="mb-4">
        <Link
          href="/admin/projects"
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Projects
        </Link>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {project.title}
        </h1>
        <Link
          href={`/admin/projects/${id}/preview`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Preview draft
        </Link>
      </div>
      <ProjectTabs project={project} currentTab={tab} />
    </div>
  );
}
