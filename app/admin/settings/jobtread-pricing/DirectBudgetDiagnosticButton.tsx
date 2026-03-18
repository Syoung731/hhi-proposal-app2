'use client';

import { useState } from "react";
import { runDirectBudgetDiagnosticForTenOakParkAction } from "./actions";

type Status = "idle" | "running" | "done" | "error";

export function DirectBudgetDiagnosticButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<string | null>(null);

  async function handleClick() {
    try {
      setStatus("running");
      setSummary(null);
      const res = await runDirectBudgetDiagnosticForTenOakParkAction();
      if (!res.ok || !res.stats) {
        setStatus("error");
        setSummary(res.message ?? "Diagnostic failed.");
        return;
      }
      const s = res.stats;
      const lines: string[] = [];
      lines.push(
        `Job ${s.jobId}: rawItemCount=${s.rawItemCount}, filteredItemCount=${s.filteredItemCount}, filteredGroupCount=${s.filteredGroupCount}`,
      );
      lines.push(
        `Totals: sell=${s.totalSell.toFixed(2)}, cost=${s.totalCost.toFixed(2)}`,
      );
      const uiSell = 249_488.81;
      const uiCost = 135_708.06;
      lines.push(
        `Delta vs JT UI: Δsell=${(s.totalSell - uiSell).toFixed(2)}, Δcost=${(s.totalCost - uiCost).toFixed(2)}`,
      );
      setSummary(lines.join(" | "));
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setSummary(e instanceof Error ? e.message : String(e));
    }
  }

  const label =
    status === "running"
      ? "Running direct JT diagnostic…"
      : "Direct JT Budget (10 Oak Park)";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "running"}
        className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {label}
      </button>
      {summary && (
        <div className="max-w-xl text-[11px] text-right text-zinc-500 dark:text-zinc-400">
          {summary}
        </div>
      )}
    </div>
  );
}

