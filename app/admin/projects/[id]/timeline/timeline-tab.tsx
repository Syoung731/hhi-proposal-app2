"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureTimelinePhasesAction, updateTimelinePhaseAction } from "./actions";

type Phase = {
  id: string;
  phase: string;
  durationText: string;
  sortOrder: number;
};

type Props = {
  projectId: string;
  phases: Phase[];
};

export function TimelineTab({ projectId, phases: initialPhases }: Props) {
  const router = useRouter();
  const [phases, setPhases] = useState(initialPhases);

  useEffect(() => {
    if (initialPhases.length === 0) {
      ensureTimelinePhasesAction(projectId).then(() => router.refresh());
    }
  }, [projectId, initialPhases.length, router]);

  async function handleBlur(phaseId: string, durationText: string) {
    await updateTimelinePhaseAction(projectId, phaseId, durationText);
    setPhases((prev) =>
      prev.map((p) => (p.id === phaseId ? { ...p, durationText } : p))
    );
    router.refresh();
  }

  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Edit duration text for each phase (e.g. &quot;2–3 weeks&quot;).
      </p>
      <div className="space-y-3">
        {sorted.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <label className="w-48 shrink-0 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {p.phase.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
            </label>
            <input
              type="text"
              defaultValue={p.durationText}
              onBlur={(e) => handleBlur(p.id, e.target.value)}
              placeholder="e.g. 2–3 weeks"
              className="flex-1 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
