"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncJobTreadPricingAction } from "@/app/admin/pricing/actions";

type SyncState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function SyncJobTreadButton() {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<SyncState>({ kind: "idle" });
  const router = useRouter();

  function handleClick() {
    setState({ kind: "idle" });
    startTransition(async () => {
      const result = await syncJobTreadPricingAction();
      if (!result.ok) {
        setState({
          kind: "error",
          message: result.error ?? "Failed to sync JobTread data.",
        });
      } else {
        const stats = result.stats;
        const message =
          stats != null
            ? stats.buildJobsFound === 0
              ? "No Build jobs found."
              : `${stats.buildJobsFound} Build jobs found; ${stats.jobsSynced} synced (${stats.jobsNew} new, ${stats.jobsChanged} changed), ${stats.jobsSkippedUnchanged} skipped (unchanged).`
            : "Sync completed.";
        setState({ kind: "success", message });
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1 text-xs sm:items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {isPending ? "Syncing…" : "Sync JobTread Jobs"}
      </button>
      {state.kind === "success" && (
        <span className="text-[11px] text-green-600 dark:text-green-400">
          {state.message}
        </span>
      )}
      {state.kind === "error" && (
        <span className="text-[11px] text-red-600 dark:text-red-400">
          {state.message}
        </span>
      )}
    </div>
  );
}

