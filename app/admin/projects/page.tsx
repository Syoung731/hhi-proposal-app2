import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { ProjectStatus } from "@/app/generated/prisma";
import { ProjectListActions } from "./project-list-actions";

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ showArchived?: string }>;
}) {
  const { showArchived } = await searchParams;
  const includeArchived = showArchived === "1" || showArchived === "true";

  const projects = await prisma.project.findMany({
    where: includeArchived ? undefined : { status: { not: ProjectStatus.ARCHIVED } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      updatedAt: true,
      proposal: { select: { id: true } },
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Projects
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href={includeArchived ? "/admin/projects" : "/admin/projects?showArchived=1"}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            {includeArchived ? "Hide archived" : "Show archived"}
          </Link>
          <Link
            href="/admin/projects/new"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            New project
          </Link>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                Title
              </th>
              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                Slug
              </th>
              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                Status
              </th>
              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                Updated
              </th>
              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  {includeArchived
                    ? "No projects yet. Create one to get started."
                    : "No active projects. Create one or show archived."}
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="font-medium hover:underline cursor-pointer"
                    >
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-600 dark:text-zinc-400">
                    {p.slug}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.status === ProjectStatus.PUBLISHED
                          ? "text-emerald-600 dark:text-emerald-400"
                          : p.status === ProjectStatus.ARCHIVED
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-zinc-500 dark:text-zinc-400"
                      }
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {p.updatedAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <ProjectListActions
                      projectId={p.id}
                      slug={p.slug}
                      proposalId={p.proposal?.id ?? null}
                      status={p.status}
                      title={p.title}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
