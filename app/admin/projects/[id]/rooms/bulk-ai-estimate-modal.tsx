"use client";

import { useCallback, useEffect, useState } from "react";

type Room = {
  id: string;
  name: string;
  scopeNarrative: string;
};

type RoomTemplateOption = {
  id: string;
  name: string;
  displayName?: string | null;
  active: boolean;
};

type RoomRow = {
  roomId: string;
  roomName: string;
  hasScope: boolean;
  hasEstimate: boolean;
  templateId: string | null;
  checked: boolean;
  status: "pending" | "generating" | "done" | "error" | "skipped";
  error?: string;
};

function autoMatchTemplate(roomName: string, templates: RoomTemplateOption[]): string | null {
  const lower = roomName.toLowerCase();
  const rules: [string[], string][] = [
    [["kitchen"], "kitchen"],
    [["bath", "bathroom"], "bath"],
    [["laundry"], "laundry"],
    [["closet"], "closet"],
    [["cope", "admin"], "cope"],
  ];
  for (const [keywords, match] of rules) {
    if (keywords.some((kw) => lower.includes(kw))) {
      const t = templates.find((t) => t.name.toLowerCase().includes(match));
      if (t) return t.id;
    }
  }
  return null;
}

export function BulkAiEstimateModal({
  projectId,
  rooms,
  roomTemplates,
  selectedTemplates,
  onClose,
}: {
  projectId: string;
  rooms: Room[];
  roomTemplates: RoomTemplateOption[];
  selectedTemplates: Record<string, string | null>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RoomRow[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [includeCope, setIncludeCope] = useState(true);
  const [copeStatus, setCopeStatus] = useState<"pending" | "generating" | "done" | "error" | "skipped">("pending");
  const [copeError, setCopeError] = useState<string | null>(null);

  // Initialize rows — fetch which rooms already have estimates
  useEffect(() => {
    async function init() {
      const checks = await Promise.all(
        rooms.map(async (room) => {
          try {
            const res = await fetch(`/api/ai-estimate?projectId=${projectId}&sectionId=${room.id}`);
            const data = await res.json();
            return { roomId: room.id, hasEstimate: !!data.estimate };
          } catch {
            return { roomId: room.id, hasEstimate: false };
          }
        })
      );

      const checkMap = new Map(checks.map((c) => [c.roomId, c.hasEstimate]));

      setRows(
        rooms.map((room) => ({
          roomId: room.id,
          roomName: room.name,
          hasScope: !!room.scopeNarrative.trim(),
          hasEstimate: checkMap.get(room.id) ?? false,
          templateId: selectedTemplates[room.id] ?? autoMatchTemplate(room.name, roomTemplates),
          checked: true,
          status: "pending" as const,
        }))
      );
    }
    init();
  }, [projectId, rooms, roomTemplates, selectedTemplates]);

  function toggleRow(roomId: string) {
    setRows((prev) => prev.map((r) => r.roomId === roomId ? { ...r, checked: !r.checked } : r));
  }

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, checked })));
  }

  function setTemplate(roomId: string, templateId: string | null) {
    setRows((prev) => prev.map((r) => r.roomId === roomId ? { ...r, templateId } : r));
  }

  const handleGenerate = useCallback(async () => {
    const toProcess = rows.filter((r) => r.checked);
    setRunning(true);
    setProgress({ current: 0, total: toProcess.length });

    for (let i = 0; i < toProcess.length; i++) {
      const row = toProcess[i]!;
      setProgress({ current: i + 1, total: toProcess.length });

      // Skip if no template or no scope
      if (!row.templateId || !row.hasScope) {
        setRows((prev) => prev.map((r) =>
          r.roomId === row.roomId ? { ...r, status: "skipped", error: !row.templateId ? "No template" : "No scope" } : r
        ));
        continue;
      }

      setRows((prev) => prev.map((r) =>
        r.roomId === row.roomId ? { ...r, status: "generating" } : r
      ));

      try {
        const room = rooms.find((r) => r.id === row.roomId);
        const res = await fetch("/api/ai-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            sectionId: row.roomId,
            roomTemplateId: row.templateId,
            scopeNarrative: room?.scopeNarrative ?? "",
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        setRows((prev) => prev.map((r) =>
          r.roomId === row.roomId ? { ...r, status: "done", hasEstimate: true } : r
        ));
      } catch (err) {
        setRows((prev) => prev.map((r) =>
          r.roomId === row.roomId ? { ...r, status: "error", error: err instanceof Error ? err.message : "Failed" } : r
        ));
      }
    }

    // After all room estimates, run COPE if checked
    if (includeCope) {
      setCopeStatus("generating");
      try {
        const copeRes = await fetch("/api/cope-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        if (!copeRes.ok) {
          const data = await copeRes.json().catch(() => ({ error: "Request failed" }));
          throw new Error(data.error || `HTTP ${copeRes.status}`);
        }
        setCopeStatus("done");
      } catch (err) {
        setCopeStatus("error");
        setCopeError(err instanceof Error ? err.message : "COPE estimate failed");
      }
    } else {
      setCopeStatus("skipped");
    }

    setRunning(false);
    setDone(true);
  }, [rows, rooms, projectId, includeCope]);

  const checkedCount = rows.filter((r) => r.checked).length;
  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const skippedCount = rows.filter((r) => r.status === "skipped").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-lg border border-zinc-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Generate AI Estimates</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">Loading rooms...</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-[10px] uppercase tracking-wider text-zinc-400">
                  <th className="pb-2 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={rows.every((r) => r.checked)}
                      onChange={(e) => toggleAll(e.target.checked)}
                      disabled={running}
                      className="h-3 w-3"
                    />
                  </th>
                  <th className="pb-2 pr-2">Room</th>
                  <th className="pb-2 pr-2 w-44">Template</th>
                  <th className="pb-2 pr-2 w-16 text-center">Scope</th>
                  <th className="pb-2 pr-2 w-20 text-center">Estimate</th>
                  <th className="pb-2 w-20 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.roomId} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={() => toggleRow(row.roomId)}
                        disabled={running}
                        className="h-3 w-3"
                      />
                    </td>
                    <td className="py-1.5 pr-2 font-medium text-zinc-800">{row.roomName}</td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={row.templateId ?? ""}
                        onChange={(e) => setTemplate(row.roomId, e.target.value || null)}
                        disabled={running}
                        className={`w-full rounded border px-1.5 py-0.5 text-xs ${!row.templateId ? "border-red-300 bg-red-50" : "border-zinc-300 bg-white"}`}
                      >
                        <option value="">Select template...</option>
                        {roomTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.displayName || t.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      {row.hasScope ? (
                        <span className="text-green-600" title="Has scope narrative">&#10003;</span>
                      ) : (
                        <span className="text-red-400" title="No scope narrative">&#10007;</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      {row.hasEstimate ? (
                        <span className="inline-flex items-center rounded bg-amber-50 px-1 py-px text-[10px] font-medium text-amber-600 border border-amber-200">exists</span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-center">
                      {row.status === "pending" && <span className="text-zinc-300">—</span>}
                      {row.status === "generating" && (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--brand-accent-spinner-track)] border-t-brand-accent" />
                      )}
                      {row.status === "done" && <span className="text-green-600 font-bold">&#10003;</span>}
                      {row.status === "error" && (
                        <span className="text-red-500 cursor-help" title={row.error}>&#10007;</span>
                      )}
                      {row.status === "skipped" && (
                        <span className="text-zinc-400 cursor-help" title={row.error}>skip</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* COPE option */}
        <div className="flex items-center gap-2 border-t border-zinc-200 px-4 py-2 bg-slate-50">
          <input
            type="checkbox"
            checked={includeCope}
            onChange={(e) => setIncludeCope(e.target.checked)}
            disabled={running}
            className="h-3 w-3"
            id="cope-checkbox"
          />
          <label htmlFor="cope-checkbox" className="text-xs text-zinc-700 font-medium">
            Also generate COPE estimate (project overhead)
          </label>
          {copeStatus === "generating" && (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
          )}
          {copeStatus === "done" && <span className="text-green-600 text-xs font-bold">&#10003;</span>}
          {copeStatus === "error" && (
            <span className="text-red-500 text-xs cursor-help" title={copeError ?? undefined}>&#10007; {copeError}</span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3">
          <div className="text-xs text-zinc-500">
            {running && copeStatus === "generating" && <span>Generating COPE estimate...</span>}
            {running && copeStatus !== "generating" && <span>Processing {progress.current} of {progress.total}...</span>}
            {done && (
              <span>
                Done: {doneCount} generated
                {errorCount > 0 && <>, {errorCount} errors</>}
                {skippedCount > 0 && <>, {skippedCount} skipped</>}
                {copeStatus === "done" && <>, COPE generated</>}
              </span>
            )}
            {!running && !done && <span>{checkedCount} of {rows.length} rooms selected</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {done ? "Close" : "Cancel"}
            </button>
            {!done && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={running || checkedCount === 0}
                className={`rounded-lg px-5 py-2 text-sm font-semibold shadow-sm ${
                  running
                    ? "text-white cursor-wait"
                    : checkedCount === 0
                      ? "bg-zinc-300 text-zinc-500 cursor-not-allowed"
                      : "text-white"
                }`}
                style={checkedCount > 0 ? { backgroundColor: "var(--brand-accent)" } : undefined}
              >
                {running ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Generating...
                  </span>
                ) : (
                  "Generate Estimates"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
