"use client";

import { useCallback, useEffect, useState } from "react";
import { useEstimateJob } from "@/app/admin/_estimate-job/context";

/**
 * Compact banner on the rooms tab that surfaces the most recent bulk
 * estimate job if it landed in a non-clean terminal state (PARTIAL or
 * FAILED). One click requeues every failed `JobItem` via the per-item
 * retry endpoint and re-activates the progress banner.
 *
 * Only renders when there's something actionable — if the latest job is
 * QUEUED/RUNNING/COMPLETED, this component returns null. Successful runs
 * stay out of the UI so the rooms tab isn't cluttered with history.
 */

type LatestJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
  totalItems: number;
  completedItems: number;
  failedItems: number;
  createdAt: string;
  completedAt: string | null;
  failedJobItems: Array<{ id: string; roomId: string; error: string | null }>;
};

export function RetryFailedRoomsBar({
  projectId,
  onRequeued,
}: {
  projectId: string;
  /** Callback fired once retries have been published — parent may use it to refresh room pricing / estimate indicators. */
  onRequeued?: () => void;
}) {
  const [job, setJob] = useState<LatestJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [requeueing, setRequeueing] = useState(false);
  const [requeueError, setRequeueError] = useState<string | null>(null);
  const { startJob, activeJobId } = useEstimateJob();

  // Load latest job on mount + whenever we just requeued (so the bar hides
  // itself once the job transitions out of PARTIAL/FAILED).
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai-estimate/bulk?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { job: LatestJob | null };
      setJob(data.job);
    } catch {
      // Silent fail — this bar is non-critical; don't surface network
      // errors to the user on a tab that's already loading other data.
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // If the banner is currently tracking a job for this project, reload our
  // snapshot when it goes terminal — covers the case where the user just
  // retried from another tab / refresh.
  useEffect(() => {
    if (!activeJobId) void load();
  }, [activeJobId, load]);

  const handleRetryAll = useCallback(async () => {
    if (!job) return;
    setRequeueing(true);
    setRequeueError(null);
    try {
      const results = await Promise.allSettled(
        job.failedJobItems.map((item) =>
          fetch(`/api/jobs/${job.id}/items/${item.id}/retry`, { method: "POST" }).then(
            async (r) => {
              if (!r.ok) {
                const body = (await r.json().catch(() => ({ error: "Retry failed" }))) as { error?: string };
                throw new Error(body.error ?? `HTTP ${r.status}`);
              }
              return r;
            },
          ),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        setRequeueError(`${failed.length} of ${results.length} retries failed to publish`);
      }
      // Re-surface the banner for this job regardless of partial publish
      // failures — the ones that DID publish will make progress, and the
      // user can retry again for any stragglers.
      startJob(job.id, projectId, job.totalItems);
      onRequeued?.();
      await load();
    } finally {
      setRequeueing(false);
    }
  }, [job, startJob, projectId, onRequeued, load]);

  if (loading) return null;
  if (!job) return null;
  if (job.status !== "PARTIAL" && job.status !== "FAILED") return null;
  if (job.failedItems === 0) return null;

  return (
    <div
      className="mb-3 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm dark:border-amber-800 dark:bg-amber-900/20"
      role="status"
    >
      <span className="text-amber-900 dark:text-amber-200">
        Last bulk estimate: <strong>{job.failedItems}</strong> of {job.totalItems} rooms failed.
      </span>
      <button
        type="button"
        onClick={handleRetryAll}
        disabled={requeueing}
        className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
      >
        {requeueing ? "Retrying…" : `Retry ${job.failedItems} failed room${job.failedItems === 1 ? "" : "s"}`}
      </button>
      {requeueError && (
        <span className="text-xs text-red-700 dark:text-red-400">{requeueError}</span>
      )}
    </div>
  );
}
