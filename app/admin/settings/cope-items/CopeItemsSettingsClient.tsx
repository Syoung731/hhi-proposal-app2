"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveCopeDefaultsAction } from "../actions";
import type { GlobalCopeSettings } from "@/app/lib/cope-defaults";
import type { CopeItem } from "@/app/lib/deck/types";
import { COPE_PAGE_LAYOUTS } from "@/app/lib/deck/types";
import { TemplateCIconPicker, type TemplateCIcon } from "@/app/admin/projects/[id]/presentation/template-c-icon-picker";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const btnClass =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";

type Props = {
  initialSettings: GlobalCopeSettings;
  hhiDefaults: GlobalCopeSettings;
  brandIcons: TemplateCIcon[];
};

export function CopeItemsSettingsClient({ initialSettings, hhiDefaults, brandIcons }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sectionLabel, setSectionLabel] = useState(initialSettings.defaultSectionLabel);
  const [headline, setHeadline] = useState(initialSettings.defaultHeadline);
  const [subheadline, setSubheadline] = useState(initialSettings.defaultSubheadline ?? "");
  const [layout, setLayout] = useState(initialSettings.defaultLayout);
  const [items, setItems] = useState<CopeItem[]>(initialSettings.defaultItems);

  const updateItem = useCallback((idx: number, patch: Partial<CopeItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const moveItem = useCallback((idx: number, dir: -1 | 1) => {
    setItems((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const updated = [...prev];
      [updated[idx], updated[target]] = [updated[target], updated[idx]];
      return updated;
    });
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      { id: `cope-${Date.now()}`, icon: "FileCheck", title: "New Item", description: "", bullets: [] },
    ]);
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  function resetToDefaults() {
    setItems(hhiDefaults.defaultItems);
    setSectionLabel(hhiDefaults.defaultSectionLabel);
    setHeadline(hhiDefaults.defaultHeadline);
    setSubheadline(hhiDefaults.defaultSubheadline ?? "");
    setLayout(hhiDefaults.defaultLayout);
  }

  async function handleSave() {
    setStatus("saving");
    setErrorMessage(null);
    const result = await saveCopeDefaultsAction({
      defaultItems: items,
      defaultLayout: layout,
      defaultSectionLabel: sectionLabel,
      defaultHeadline: headline,
      defaultSubheadline: subheadline || null,
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
          COPE Items Defaults
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Default Cost of Project Execution items used when a new COPE slide is added to any proposal deck.
        </p>
      </header>

      <div className="space-y-6 max-w-3xl">
        <div>
          <label className={labelClass}>Default Section Label</label>
          <input type="text" value={sectionLabel} onChange={(e) => setSectionLabel(e.target.value)} placeholder="WHAT'S INCLUDED" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Default Headline</label>
          <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="The Cost of Project Execution" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Default Subheadline (optional)</label>
          <input type="text" value={subheadline} onChange={(e) => setSubheadline(e.target.value)} placeholder="" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Default Layout</label>
          <select value={layout} onChange={(e) => setLayout(e.target.value as typeof layout)} className={inputClass}>
            {COPE_PAGE_LAYOUTS.map((l) => (
              <option key={l.key} value={l.key}>{l.label}</option>
            ))}
          </select>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-700" />

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass + " !mb-0"}>COPE Items</label>
            <button type="button" onClick={addItem} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
              + Add Item
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, ii) => (
              <div key={item.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Item {ii + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveItem(ii, -1)} disabled={ii === 0} className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-700">▲</button>
                    <button type="button" onClick={() => moveItem(ii, 1)} disabled={ii === items.length - 1} className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-700">▼</button>
                    <button type="button" onClick={() => removeItem(ii)} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">Remove</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Title</label>
                    <input type="text" value={item.title} onChange={(e) => updateItem(ii, { title: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <TemplateCIconPicker
                      icons={brandIcons}
                      value={item.iconId ?? null}
                      onChange={(iconId) => {
                        const ic = iconId ? brandIcons.find((i) => i.id === iconId) : null;
                        updateItem(ii, { iconId: iconId ?? null, iconUrl: ic?.imageUrl ?? null });
                      }}
                      label="Icon"
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="mb-1 block text-xs text-zinc-500">Description</label>
                  <textarea value={item.description} onChange={(e) => updateItem(ii, { description: e.target.value })} rows={2} className={inputClass + " resize-y"} />
                </div>

                <div className="mb-3">
                  <label className="mb-1 block text-xs text-zinc-500">Callout Label (for Annotated layout)</label>
                  <input type="text" value={item.calloutLabel ?? ""} onChange={(e) => updateItem(ii, { calloutLabel: e.target.value || null })} className={inputClass} />
                </div>

                {/* Bullets */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-zinc-500">Bullets (for Icon Columns layout)</label>
                    <button
                      type="button"
                      onClick={() => updateItem(ii, { bullets: [...(item.bullets ?? []), ""] })}
                      className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      + bullet
                    </button>
                  </div>
                  {(item.bullets ?? []).map((b, bi) => (
                    <div key={bi} className="flex gap-2 items-center mb-1">
                      <input
                        type="text"
                        value={b}
                        onChange={(e) => {
                          const bullets = [...(item.bullets ?? [])];
                          bullets[bi] = e.target.value;
                          updateItem(ii, { bullets });
                        }}
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const bullets = (item.bullets ?? []).filter((_, i) => i !== bi);
                          updateItem(ii, { bullets });
                        }}
                        className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

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
