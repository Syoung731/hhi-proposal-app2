"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rebuildPricingStagingAction } from "./actions";

type LastResult = {
  jobsCount: number;
  roomsCount: number;
  tradesCount: number;
};

type Props = {
  initialLastResult?: LastResult | null;
};

export function RebuildPricingStagingButton({ initialLastResult = null }: Props) {
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<LastResult | null>(
    initialLastResult,
  );
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = await rebuildPricingStagingAction();
      setLastResult({
        jobsCount: result.jobsCount,
        roomsCount: result.roomsCount,
        tradesCount: result.tradesCount,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {isPending ? "Rebuilding…" : "Rebuild JobTread Pricing Staging"}
      </button>
      {lastResult && (
        <div className="text-zinc-500 dark:text-zinc-400">
          <div>
            Last rebuild:{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              {lastResult.jobsCount}
            </span>{" "}
            jobs,&nbsp;
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              {lastResult.roomsCount}
            </span>{" "}
            rooms,&nbsp;
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              {lastResult.tradesCount}
            </span>{" "}
            trades
          </div>
        </div>
      )}
    </div>
  );
}

