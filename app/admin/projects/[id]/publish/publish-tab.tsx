"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { publishProjectAction } from "./actions";

type Props = {
  projectId: string;
  proposalId: string | null;
  publishedVersion: number;
  /** Latest PublishedSnapshot metadata — null when no version has been published yet. */
  latestSnapshotId: string | null;
  latestSnapshotVersion: number | null;
  /** ISO strings — `null` when no snapshot exists. */
  latestSnapshotCreatedAt: string | null;
  latestSnapshotSentAt: string | null;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

export function PublishTab({
  projectId,
  proposalId,
  publishedVersion,
  latestSnapshotId,
  latestSnapshotVersion,
  latestSnapshotCreatedAt,
  latestSnapshotSentAt,
}: Props) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handlePublish() {
    setPublishing(true);
    await publishProjectAction(projectId);
    setPublishing(false);
    setConfirmOpen(false);
    router.refresh();
  }

  const draftPreviewUrl = `/proposals/draft?projectId=${encodeURIComponent(projectId)}&draft=1`;
  const shareUrl = latestSnapshotId
    ? `/proposals/${encodeURIComponent(latestSnapshotId)}`
    : null;

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      const absolute =
        typeof window !== "undefined"
          ? `${window.location.origin}${shareUrl}`
          : shareUrl;
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      {/* Preview (Draft) */}
      <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-800/30">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Preview (Draft)
          </h2>
        </div>
        <div className="p-4">
          {proposalId ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Open the client-facing draft preview (live project data, DRAFT banner).
              </p>
              <Link
                href={draftPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Open draft preview →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Publish to enable draft preview.
            </p>
          )}
        </div>
      </section>

      {/* Share Link */}
      {shareUrl && latestSnapshotVersion != null && (
        <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/30">
          <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Share Link
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Version-locked URL. This always shows version {latestSnapshotVersion} — even if you publish again later.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              {shareUrl}
            </code>
            <button
              type="button"
              onClick={copyShareLink}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <Link
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Open →
            </Link>
          </div>
          <div className="mt-3 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-500">
            {latestSnapshotCreatedAt && (
              <p>Published: {formatDate(latestSnapshotCreatedAt)}</p>
            )}
            {latestSnapshotSentAt && (
              <p>Sent to client: {formatDate(latestSnapshotSentAt)}</p>
            )}
          </div>
        </section>
      )}

      {/* Publish controls */}
      <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/30">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Publish</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Publishing creates a locked snapshot of the current draft. The share link above always
          points at version {publishedVersion > 0 ? publishedVersion : "—"}; publishing again will
          not change existing links that were already sent to clients.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={publishing}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {publishing ? "Publishing…" : publishedVersion > 0 ? "Publish new version" : "Publish"}
          </button>
        </div>
      </section>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-4 max-w-sm rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Publish proposal?
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This will create version {publishedVersion + 1} as a new share link. Previously sent
              links stay locked to the version the client saw.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                {publishing ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
