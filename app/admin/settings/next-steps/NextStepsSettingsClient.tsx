"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveNextStepsDefaultsAction } from "../actions";
import type { GlobalNextStepsSettings } from "@/app/lib/next-steps-defaults";
import type { NextStep } from "@/app/lib/deck/types";
import { NEXT_STEPS_LAYOUTS } from "@/app/lib/deck/types";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const btnClass =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";

type Props = {
  initialSettings: GlobalNextStepsSettings;
  hhiDefaults: GlobalNextStepsSettings;
};

export function NextStepsSettingsClient({ initialSettings, hhiDefaults }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sectionLabel, setSectionLabel] = useState(initialSettings.defaultSectionLabel);
  const [headline, setHeadline] = useState(initialSettings.defaultHeadline);
  const [layout, setLayout] = useState(initialSettings.defaultLayout);
  const [steps, setSteps] = useState<NextStep[]>(initialSettings.defaultSteps);

  const updateStep = useCallback((idx: number, patch: Partial<NextStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const moveStep = useCallback((idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const updated = [...prev];
      [updated[idx], updated[target]] = [updated[target], updated[idx]];
      return updated;
    });
  }, []);

  const addStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      {
        id: `step-${Date.now()}`,
        number: prev.length + 1,
        title: "New Step",
        description: "",
      },
    ]);
  }, []);

  const removeStep = useCallback((idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  function resetToDefaults() {
    setSteps(hhiDefaults.defaultSteps);
    setSectionLabel(hhiDefaults.defaultSectionLabel);
    setHeadline(hhiDefaults.defaultHeadline);
    setLayout(hhiDefaults.defaultLayout);
  }

  async function handleSave() {
    setStatus("saving");
    setErrorMessage(null);
    const result = await saveNextStepsDefaultsAction({
      defaultSteps: steps,
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
          Next Steps Defaults
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Default steps used when a new Next Steps slide is added to any proposal deck.
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
            placeholder="WHAT HAPPENS NEXT"
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
            placeholder="Your Path Forward"
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
            {NEXT_STEPS_LAYOUTS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Contact defaults removed — contact info lives on the Closing slide. */}

        {/* Divider */}
        <div className="border-t border-zinc-200 dark:border-zinc-700" />

        {/* Steps list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass + " !mb-0"}>Steps</label>
            <button
              type="button"
              onClick={addStep}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              + Add Step
            </button>
          </div>

          <div className="space-y-4">
            {steps.map((step, si) => (
              <div
                key={step.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Step {si + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveStep(si, -1)}
                      disabled={si === 0}
                      className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-700"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(si, 1)}
                      disabled={si === steps.length - 1}
                      className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-700"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(si)}
                      className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Number</label>
                    <input
                      type="number"
                      value={step.number}
                      onChange={(e) => updateStep(si, { number: parseInt(e.target.value) || si + 1 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Title</label>
                    <input
                      type="text"
                      value={step.title}
                      onChange={(e) => updateStep(si, { title: e.target.value })}
                      placeholder="Step title"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Description</label>
                  <textarea
                    value={step.description}
                    onChange={(e) => updateStep(si, { description: e.target.value })}
                    placeholder="Step description"
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
