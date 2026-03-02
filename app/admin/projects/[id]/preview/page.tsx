import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";
import { ProposalPublicPage } from "@/components/public/ProposalPublicPage";
import type { SnapshotData } from "@/app/lib/snapshot";

/**
 * Admin-only preview of the published proposal UI.
 * Fetches project by id (no published filter) and renders the same UI as /p/[id].
 * If the project has no published snapshot yet, shows a message and link to publish.
 */
export default async function AdminProjectPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      proposal: { select: { id: true } },
      publishedSnapshots: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  if (!project) notFound();

  const snapshotRow = project.publishedSnapshots[0];
  if (!snapshotRow) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-zinc-600 dark:text-zinc-400">
          No published version yet. Publish the project to preview the public page.
        </p>
        <Link
          href={`/admin/projects/${id}?tab=publish`}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Go to Publish
        </Link>
        <Link
          href={`/admin/projects/${id}`}
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Back to edit
        </Link>
      </div>
    );
  }

  const snapshot = snapshotRow.snapshotJson as unknown as SnapshotData;
  return (
    <ProposalPublicPage
      snapshot={snapshot}
      proposalId={project.proposal?.id ?? null}
      backHref={`/admin/projects/${id}`}
    />
  );
}
