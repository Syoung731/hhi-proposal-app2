"use client";

import { useState, useTransition } from "react";
import { runRichJobTreadBudgetFilterDiagnosticAction } from "./actions";

export function RichBudgetFilterDiagnosticButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await runRichJobTreadBudgetFilterDiagnosticAction();
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
        className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
      >
        {isPending ? "Running…" : "Run rich JobTread budget filter diagnostic (125 South Shore)"}
      </button>
      {message && (
        <span className="max-w-md text-right text-[11px] text-zinc-500 dark:text-zinc-400">
          {message}
        </span>
      )}
    </div>
  );
}
