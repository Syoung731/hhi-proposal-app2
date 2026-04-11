"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveCoreValuesDefaultsAction } from "../actions";
import type { GlobalCoreValuesSettings } from "@/app/lib/core-values-defaults";
import type { CoreValue } from "@/app/lib/deck/types";
import { CORE_VALUES_LAYOUTS } from "@/app/lib/deck/types";
import { TemplateCIconPicker, type TemplateCIcon } from "@/app/admin/projects/[id]/presentation/template-c-icon-picker";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const btnClass =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";

type Props = {
  initialSettings: GlobalCoreValuesSettings;
  hhiDefaults: GlobalCoreValuesSettings;
  brandIcons: TemplateCIcon[];
};

export function CoreValuesSettingsClient({ initialSettings, hhiDefaults, brandIcons }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sectionLabel, setSectionLabel] = useState(initialSettings.defaultSectionLabel);
  const [headline, setHeadline] = useState(initialSettings.defaultHeadline);
  const [layout, setLayout] = useState(initialSettings.defaultLayout);
  const [values, setValues] = useState<CoreValue[]>(initialSettings.defaultValues);

  const updateValue = useCallback((idx: number, patch: Partial<CoreValue>) => {
    setValues((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }, []);

  const moveValue = useCallback((idx: number, dir: -1 | 1) => {
    setValues((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const updated = [...prev];
      [updated[idx], updated[target]] = [updated[target], updated[idx]];
      return updated;
    });
  }, []);

  const addValue = useCallback(() => {
    setValues((prev) => [
      ...prev,
      {
        id: `value-${Date.now()}`,
        name: "NEW VALUE",
        icon: "Shield",
        descriptor: "",
        description: "",
      },
    ]);
  }, []);

  const removeValue = useCallback((idx: number) => {
    setValues((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  function resetToDefaults() {
    setValues(hhiDefaults.defaultValues);
    setSectionLabel(hhiDefaults.defaultSectionLabel);
    setHeadline(hhiDefaults.defaultHeadline);
    setLayout(hhiDefaults.defaultLayout);
  }

  async function handleSave() {
    setStatus("saving");
    setErrorMessage(null);
    const result = await saveCoreValuesDefaultsAction({
      defaultValues: values,
      defaultLayout: layout,
      defaultSectionLabel: sectionLabel,
      defaultHeadline: headline,
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
          Core Values Defaults
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Default values used when a new Core Values slide is added to any proposal deck.
        </p>
      </header>

      <div className="space-y-6 max-w-3xl">
        {/* Section Label */}
        <div>
          <label className={labelClass}>Default Section Label</label>
          <input
            type="text"
            value={sectionLabel}
            onChange={(e) => setSectionLabel(e.target.value)}
            placeholder="WHO WE ARE"
            className={inputClass}
          />
        </div>

        {/* Headline */}
        <div>
          <label className={labelClass}>Default Headline</label>
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Built on a Foundation of Values"
            className={inputClass}
          />
        </div>

        {/* Default Layout */}
        <div>
          <label className={labelClass}>Default Layout</label>
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as typeof layout)}
            className={inputClass}
          >
            {CORE_VALUES_LAYOUTS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-200 dark:border-zinc-700" />

        {/* Values list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass + " !mb-0"}>Values</label>
            <button
              type="button"
              onClick={addValue}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              + Add Value
            </button>
          </div>

          <div className="space-y-4">
            {values.map((val, vi) => (
              <div
                key={val.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Value {vi + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveValue(vi, -1)}
                      disabled={vi === 0}
                      className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-700"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveValue(vi, 1)}
                      disabled={vi === values.length - 1}
                      className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-700"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeValue(vi)}
                      className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Name</label>
                    <input
                      type="text"
                      value={val.name}
                      onChange={(e) => updateValue(vi, { name: e.target.value })}
                      placeholder="VALUE NAME"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <TemplateCIconPicker
                      icons={brandIcons}
                      value={val.iconId ?? null}
                      onChange={(iconId) => {
                        const icon = iconId ? brandIcons.find((i) => i.id === iconId) : null;
                        updateValue(vi, { iconId: iconId ?? null, iconUrl: icon?.imageUrl ?? null });
                      }}
                      label="Icon"
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="mb-1 block text-xs text-zinc-500">Descriptor</label>
                  <input
                    type="text"
                    value={val.descriptor}
                    onChange={(e) => updateValue(vi, { descriptor: e.target.value })}
                    placeholder="Short tagline"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Description</label>
                  <textarea
                    value={val.description}
                    onChange={(e) => updateValue(vi, { description: e.target.value })}
                    placeholder="2-3 sentences describing this value"
                    rows={2}
                    className={inputClass + " resize-y"}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={status === "saving"}
            className={btnClass}
          >
            {status === "saving" ? "Saving\u2026" : "Save Defaults"}
          </button>
          <button
            type="button"
            onClick={resetToDefaults}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Reset to HHI Defaults
          </button>
          {status === "saved" && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Saved successfully.
            </span>
          )}
          {status === "error" && errorMessage && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
