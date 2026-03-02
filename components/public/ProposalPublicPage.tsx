import Link from "next/link";
import { ProposalFromSnapshotView } from "@/app/components/proposal-from-snapshot";
import type { SnapshotData } from "@/app/lib/snapshot";

export type ProposalPublicPageProps = {
  /** Snapshot data (e.g. from PublishedSnapshot or built from project). Required to render. */
  snapshot: SnapshotData;
  /** Proposal id for the "Download PDF" link. Omit to hide the link (e.g. admin preview before publish). */
  proposalId?: string | null;
  /** When true, header and footer are hidden (e.g. print view). */
  isPrint?: boolean;
  /** Optional link back (e.g. admin preview: link to project edit). */
  backHref?: string | null;
};

/**
 * Reusable public proposal UI: header (PDF link), snapshot content, footer.
 * Used by /p/[id] (public) and /admin/projects/[id]/preview (admin-only).
 * Caller is responsible for loading snapshot (and proposalId when available).
 */
export function ProposalPublicPage({
  snapshot,
  proposalId,
  isPrint = false,
  backHref,
}: ProposalPublicPageProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      {!isPrint && (
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            {backHref ? (
              <Link
                href={backHref}
                className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
              >
                ← Back to edit
              </Link>
            ) : (
              <span />
            )}
            {proposalId ? (
              <a
                href={`/p/${proposalId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Download PDF
              </a>
            ) : (
              <span />
            )}
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
