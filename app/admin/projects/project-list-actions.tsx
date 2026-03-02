"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  archiveProjectAction,
  unarchiveProjectAction,
  deleteProjectAction,
} from "./actions";
import { ProjectStatus } from "@/app/generated/prisma";

type Props = {
  projectId: string;
  slug: string;
  proposalId: string | null;
  status: ProjectStatus;
  title: string;
};

export function ProjectListActions({ projectId, slug, proposalId, status, title }: Props) {
  const router = useRouter();
  const [archivePending, setArchivePending] = useState(false);
  const [unarchivePending, setUnarchivePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isArchived = status === ProjectStatus.ARCHIVED;

  async function handleArchive() {
    setError(null);
    setArchivePending(true);
    const result = await archiveProjectAction(projectId);
    setArchivePending(false);
    setArchiveConfirmOpen(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleUnarchive() {
    setError(null);
    setUnarchivePending(true);
    const result = await unarchiveProjectAction(projectId);
    setUnarchivePending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    setError(null);
    setDeletePending(true);
    const result = await deleteProjectAction(projectId);
    setDeletePending(false);
    setDeleteConfirmOpen(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {isArchived ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            handleUnarchive();
          }}
          disabled={unarchivePending}
          className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {unarchivePending ? "…" : "Unarchive"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setArchiveConfirmOpen(true)}
          disabled={archivePending}
          className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/30"
        >
          Archive
        </button>
      )}
      <button
        type="button"
        onClick={() => setDeleteConfirmOpen(true)}
        disabled={deletePending}
        className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
      >
        Delete
      </button>
      {status === ProjectStatus.PUBLISHED && proposalId && (
        <>
          <span className="text-zinc-400 dark:text-zinc-500">·</span>
          <Link
            href={`/p/${proposalId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            View
          </Link>
        </>
      )}
      {error && (
        <p className="w-full text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {archiveConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-confirm-title"
        >
          <div className="mx-4 max-w-sm rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
            <h3 id="archive-confirm-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Archive project?
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              “{title}” will be hidden from the main list. You can show archived projects and unarchive it later.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setArchiveConfirmOpen(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchive}
                disabled={archivePending}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {archivePending ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <div className="mx-4 max-w-sm rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
            <h3 id="delete-confirm-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Delete project?
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              “{title}” and all its rooms, media, and data will be permanently deleted. Uploaded files will be removed from storage. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletePending}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletePending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
