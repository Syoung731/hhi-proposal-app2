"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveDesignBuildDefaultsAction } from "../actions";
import type { GlobalDesignBuildSettings } from "@/app/lib/design-build-defaults";
import type {
  DesignBuildPillar,
  DesignBuildGuarantee,
  DesignBuildDiagramNode,
  DesignBuildSupportColumn,
} from "@/app/lib/deck/types";
import { DESIGN_BUILD_ADVANTAGE_LAYOUTS } from "@/app/lib/deck/types";
import { TemplateCIconPicker, type TemplateCIcon } from "@/app/admin/projects/[id]/presentation/template-c-icon-picker";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const btnClass =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";

type Props = {
  initialSettings: GlobalDesignBuildSettings;
  hhiDefaults: GlobalDesignBuildSettings;
  brandIcons: TemplateCIcon[];
};

export function DesignBuildSettingsClient({ initialSettings, hhiDefaults, brandIcons }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [headline, setHeadline] = useState(initialSettings.defaultHeadline);
  const [layout, setLayout] = useState(initialSettings.defaultLayout);
  const [pillars, setPillars] = useState<DesignBuildPillar[]>(initialSettings.defaultPillars);
  const [guarantees, setGuarantees] = useState<DesignBuildGuarantee[]>(initialSettings.defaultGuarantees);
  const [diagramNodes, setDiagramNodes] = useState<DesignBuildDiagramNode[]>(initialSettings.defaultDiagramNodes);
  const [supportColumns, setSupportColumns] = useState<DesignBuildSupportColumn[]>(initialSettings.defaultSupportColumns);

  // Pillar helpers
  const updatePillar = useCallback((idx: number, patch: Partial<DesignBuildPillar>) => {
    setPillars((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }, []);
  const movePillar = useCallback((idx: number, dir: -1 | 1) => {
    setPillars((prev) => {
      const t = idx + dir;
      if (t < 0 || t >= prev.length) return prev;
      const u = [...prev];
      [u[idx], u[t]] = [u[t], u[idx]];
      return u;
    });
  }, []);

  // Guarantee helpers
  const updateGuarantee = useCallback((idx: number, patch: Partial<DesignBuildGuarantee>) => {
    setGuarantees((prev) => prev.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }, []);

  // Column helpers
  const updateColumn = useCallback((idx: number, patch: Partial<DesignBuildSupportColumn>) => {
    setSupportColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }, []);
  const moveColumn = useCallback((idx: number, dir: -1 | 1) => {
    setSupportColumns((prev) => {
      const t = idx + dir;
      if (t < 0 || t >= prev.length) return prev;
      const u = [...prev];
      [u[idx], u[t]] = [u[t], u[idx]];
      return u;
    });
  }, []);

  function resetToDefaults() {
    setHeadline(hhiDefaults.defaultHeadline);
    setLayout(hhiDefaults.defaultLayout);
    setPillars(hhiDefaults.defaultPillars);
    setGuarantees(hhiDefaults.defaultGuarantees);
    setDiagramNodes(hhiDefaults.defaultDiagramNodes);
    setSupportColumns(hhiDefaults.defaultSupportColumns);
  }

  async function handleSave() {
    setStatus("saving");
    setErrorMessage(null);
    const result = await saveDesignBuildDefaultsAction({
      defaultLayout: layout,
      defaultHeadline: headline,
      defaultPillars: pillars,
      defaultGuarantees: guarantees,
      defaultDiagramNodes: diagramNodes,
      defaultSupportColumns: supportColumns,
    });
    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setStatus("saved");
    router.refresh();
    setTimeout(() => setStatus("idle"), 3000);
  }

  return (
    <div className="min-h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Design-Build Advantage Defaults
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Default content used when a new Design-Build Advantage slide is added to any proposal deck.
        </p>
      </header>

      <div className="space-y-6 max-w-3xl">
        {/* Headline */}
        <div>
          <label className={labelClass}>Default Headline</label>
          <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="The Design-Build Advantage" className={inputClass} />
        </div>

        {/* Layout */}
        <div>
          <label className={labelClass}>Default Layout</label>
          <select value={layout} onChange={(e) => setLayout(e.target.value as typeof layout)} className={inputClass}>
            {DESIGN_BUILD_ADVANTAGE_LAYOUTS.map((l) => (
              <option key={l.key} value={l.key}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Pillars */}
        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-700">
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass + " !mb-0"}>Pillars (Layouts A &amp; C)</label>
            <button type="button" onClick={() => setPillars((p) => [...p, { id: `p-${Date.now()}`, icon: "Shield", title: "", description: "" }])} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">+ Add</button>
          </div>
          <div className="space-y-4">
            {pillars.map((p, pi) => (
              <div key={p.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pillar {pi + 1}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => movePillar(pi, -1)} disabled={pi === 0} className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => movePillar(pi, 1)} disabled={pi === pillars.length - 1} className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30">▼</button>
                    <button type="button" onClick={() => setPillars((prev) => prev.filter((_, i) => i !== pi))} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Remove</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <TemplateCIconPicker
                      icons={brandIcons}
                      value={p.iconId ?? null}
                      onChange={(iconId) => {
                        const ic = iconId ? brandIcons.find((i) => i.id === iconId) : null;
                        updatePillar(pi, { iconId: iconId ?? null, iconUrl: ic?.imageUrl ?? null });
                      }}
                      label="Icon"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Title</label>
                    <input type="text" value={p.title} onChange={(e) => updatePillar(pi, { title: e.target.value })} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Description</label>
                  <textarea value={p.description} onChange={(e) => updatePillar(pi, { description: e.target.value })} rows={2} className={inputClass + " resize-y"} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Guarantees */}
        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-700">
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass + " !mb-0"}>Guarantees (Layout B)</label>
            <button type="button" onClick={() => setGuarantees((g) => [...g, { id: `g-${Date.now()}`, title: "", description: "" }])} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">+ Add</button>
          </div>
          <div className="space-y-4">
            {guarantees.map((g, gi) => (
              <div key={g.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Guarantee {gi + 1}</span>
                  <button type="button" onClick={() => setGuarantees((prev) => prev.filter((_, i) => i !== gi))} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Remove</button>
                </div>
                <div className="mb-3">
                  <label className="mb-1 block text-xs text-zinc-500">Title</label>
                  <input type="text" value={g.title} onChange={(e) => updateGuarantee(gi, { title: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Description</label>
                  <textarea value={g.description} onChange={(e) => updateGuarantee(gi, { description: e.target.value })} rows={2} className={inputClass + " resize-y"} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Diagram nodes */}
        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-700">
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass + " !mb-0"}>Cycle Diagram Nodes (Layout D)</label>
            <button type="button" onClick={() => setDiagramNodes((n) => [...n, { id: `n-${Date.now()}`, label: "" }])} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">+ Add</button>
          </div>
          <div className="space-y-2">
            {diagramNodes.map((n, ni) => (
              <div key={n.id} className="flex items-center gap-2">
                <input type="text" value={n.label} onChange={(e) => setDiagramNodes((prev) => prev.map((x, i) => (i === ni ? { ...x, label: e.target.value } : x)))} placeholder={`Node ${ni + 1}`} className={inputClass} />
                {diagramNodes.length > 2 && (
                  <button type="button" onClick={() => setDiagramNodes((prev) => prev.filter((_, i) => i !== ni))} className="text-xs text-red-500 hover:text-red-700 px-2">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Support columns */}
        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-700">
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass + " !mb-0"}>Support Columns (Layout D)</label>
            <button type="button" onClick={() => setSupportColumns((c) => [...c, { id: `c-${Date.now()}`, title: "", description: "" }])} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">+ Add</button>
          </div>
          <div className="space-y-4">
            {supportColumns.map((col, ci) => (
              <div key={col.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Column {ci + 1}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveColumn(ci, -1)} disabled={ci === 0} className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => moveColumn(ci, 1)} disabled={ci === supportColumns.length - 1} className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30">▼</button>
                    <button type="button" onClick={() => setSupportColumns((prev) => prev.filter((_, i) => i !== ci))} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Remove</button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="mb-1 block text-xs text-zinc-500">Title</label>
                  <input type="text" value={col.title} onChange={(e) => updateColumn(ci, { title: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Description</label>
                  <textarea value={col.description} onChange={(e) => updateColumn(ci, { description: e.target.value })} rows={2} className={inputClass + " resize-y"} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button type="button" onClick={handleSave} disabled={status === "saving"} className={btnClass}>
            {status === "saving" ? "Saving\u2026" : "Save Defaults"}
          </button>
          <button type="button" onClick={resetToDefaults} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
            Reset to HHI Defaults
          </button>
          {status === "saved" && <span className="text-sm text-green-600 dark:text-green-400">Saved successfully.</span>}
          {status === "error" && errorMessage && <span className="text-sm text-red-600 dark:text-red-400">{errorMessage}</span>}
        </div>
      </div>
    </div>
  );
}
