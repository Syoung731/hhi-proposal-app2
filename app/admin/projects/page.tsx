import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { ProjectStatus } from "@/app/generated/prisma";

export default async function AdminProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, title: true, status: true, updatedAt: true },
  });
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Projects
        </h1>
        <Link
          href="/admin/projects/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          New project
        </Link>
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
                  No projects yet. Create one to get started.
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                    {p.title}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-600 dark:text-zinc-400">
                    {p.slug}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.status === ProjectStatus.PUBLISHED
                          ? "text-emerald-600 dark:text-emerald-400"
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
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="text-zinc-600 hover:underline dark:text-zinc-400"
                    >
                      Edit
                    </Link>
                    {p.status === ProjectStatus.PUBLISHED && (
                      <>
                        {" · "}
                        <Link
                          href={`/p/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-600 hover:underline dark:text-zinc-400"
                        >
                          View
                        </Link>
                      </>
                    )}
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
