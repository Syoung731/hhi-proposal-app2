"use client";

import { useState, useTransition } from "react";
import { runDuplicationDiagnosticAction } from "./actions";

export function DuplicationDiagnosticButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await runDuplicationDiagnosticAction();
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
        className="inline-flex items-center justify-center rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200 dark:hover:bg-sky-900/50"
      >
        {isPending ? "Running…" : "Run duplication diagnostic (125 South Shore)"}
      </button>
      {message && (
        <span className="max-w-md text-right text-[11px] text-zinc-500 dark:text-zinc-400">
          {message}
        </span>
      )}
    </div>
  );
}
