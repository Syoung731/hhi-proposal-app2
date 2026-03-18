"use client";

import { useState } from "react";
import { StagingDiagnosticButton } from "./StagingDiagnosticButton";
import { DuplicationDiagnosticButton } from "./DuplicationDiagnosticButton";
import { ForcedSourceDiagnosticButton } from "./ForcedSourceDiagnosticButton";
import { RichBudgetFilterDiagnosticButton } from "./RichBudgetFilterDiagnosticButton";
import { DirectBudgetDiagnosticButton } from "./DirectBudgetDiagnosticButton";

export function DeveloperToolsPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full rounded-md border border-zinc-200/80 bg-zinc-50/50 dark:border-zinc-700/80 dark:bg-zinc-800/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
        aria-expanded={open}
      >
        <span>Developer Tools</span>
        <span
          className={`inline-block transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-200/80 px-3 py-2 dark:border-zinc-700/80">
          <div className="flex flex-wrap items-start gap-3">
            <StagingDiagnosticButton />
            <DuplicationDiagnosticButton />
            <ForcedSourceDiagnosticButton />
            <RichBudgetFilterDiagnosticButton />
            <DirectBudgetDiagnosticButton />
          </div>
        </div>
      )}
    </div>
  );
}
