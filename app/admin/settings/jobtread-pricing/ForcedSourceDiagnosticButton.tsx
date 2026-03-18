"use client";

import { useState, useTransition } from "react";
import { runForcedPaveSourceDiagnosticAction } from "./actions";

export function ForcedSourceDiagnosticButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await runForcedPaveSourceDiagnosticAction();
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
        className="inline-flex items-center justify-center rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-200 dark:hover:bg-violet-900/50"
      >
        {isPending ? "Running…" : "Forced Pave source diagnostic (125 South Shore)"}
      </button>
      {message && (
        <span className="max-w-md text-right text-[11px] text-zinc-500 dark:text-zinc-400">
          {message}
        </span>
      )}
    </div>
  );
}
