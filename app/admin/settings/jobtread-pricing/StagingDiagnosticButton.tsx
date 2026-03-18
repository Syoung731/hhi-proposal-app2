"use client";

import { useState, useTransition } from "react";
import { runStagingDiagnosticAction } from "./actions";

export function StagingDiagnosticButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await runStagingDiagnosticAction();
      setMessage(result.ok ? result.message : result.message);
    });
  }

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
      >
        {isPending ? "Running…" : "Run staging diagnostic (10 Oak Park)"}
      </button>
      {message && (
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {message}
        </span>
      )}
    </div>
  );
}
