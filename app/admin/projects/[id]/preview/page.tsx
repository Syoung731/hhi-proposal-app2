import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { DraftProposalView } from "@/app/components/draft-proposal-view";

export default async function AdminProjectPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Draft preview
          </span>
          <Link
            href={`/admin/projects/${id}`}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ← Back to edit
          </Link>
        </div>
      </div>
      <DraftProposalView project={project} />
    </div>
  );
}
