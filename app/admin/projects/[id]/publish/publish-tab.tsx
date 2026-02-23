"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { publishProjectAction } from "./actions";

type Props = {
  projectId: string;
  slug: string;
  publishedVersion: number;
};

export function PublishTab({ projectId, slug, publishedVersion }: Props) {
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
    <div className="space-y-4">
      <p className="text-zinc-600 dark:text-zinc-400">
        Publishing creates a locked snapshot of the current draft. The public page and PDF will show
        this version until you publish again.
      </p>
      {publishedVersion > 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Current published version: {publishedVersion}. Share link:{" "}
          <Link
            href={`/p/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-700 underline dark:text-zinc-300"
          >
            /p/{slug}
          </Link>
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={publishing}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {publishing ? "Publishing…" : "Publish"}
        </button>
        {publishedVersion > 0 && (
          <Link
            href={`/p/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            View public page
          </Link>
        )}
      </div>
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
