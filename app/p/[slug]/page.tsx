import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { ProposalFromSnapshotView } from "@/app/components/proposal-from-snapshot";
import type { SnapshotData } from "@/app/lib/snapshot";

export default async function PublicProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { slug } = await params;
  const { print } = await searchParams;
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!project) notFound();
  const snapshotRow = await prisma.publishedSnapshot.findFirst({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
  });
  if (!snapshotRow) notFound();
  const snapshot = snapshotRow.snapshotJson as unknown as SnapshotData;
  const isPrint = print === "1";

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      {!isPrint && (
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="mx-auto flex max-w-4xl items-center justify-end">
            <a
              href={`/p/${slug}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Download PDF
            </a>
          </div>
        </header>
      )}
      <ProposalFromSnapshotView snapshot={snapshot} />
      {!isPrint && (
        <footer className="border-t border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
          <Link href="/" className="hover:underline">
            HHI Builders
          </Link>
        </footer>
      )}
    </div>
  );
}
