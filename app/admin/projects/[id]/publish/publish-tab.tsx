"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { publishProjectAction } from "./actions";

type Props = {
  projectId: string;
  proposalId: string | null;
  publishedVersion: number;
};

export function PublishTab({ projectId, proposalId, publishedVersion }: Props) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handlePublish() {
    setPublishing(true);
    await publishProjectAction(projectId);
    setPublishing(false);
    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Preview (Draft) — open real public presentation in new tab */}
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
                Open the admin draft preview (live project data, no admin chrome).
              </p>
              <Link
                href={`/admin/projects/${projectId}/preview/draft`}
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

      {/* Publish controls */}
      <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/30">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Publish</h2>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">
          Publishing creates a locked snapshot of the current draft. The public page and PDF will show
          this version until you publish again.
        </p>
        {publishedVersion > 0 && (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            Current published version: {publishedVersion}. Public share link disabled
            pending Cleanup D (new deck-render route).
          </p>
        )}
        {/* TODO: Cleanup D — restore Share link and "View public page" button once the
            new deck-render public route lands. Original target: /p/{proposalId} */}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={publishing}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {publishing ? "Publishing…" : "Publish"}
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
              This will create version {publishedVersion + 1} and update the public page and PDF
              download.
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
