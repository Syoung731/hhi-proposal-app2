"use client";

import type { WhyUsPageConfig, WhyUsPillar } from "@/app/lib/layout-config";
import { TemplateCIconPicker } from "../template-c-icon-picker";
import { DEFAULT_WHY_US_TITLE } from "@/components/presentation/why-us/defaults";

const labelClass = "mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
const textareaClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

export type WhyUsContentEditorProps = {
  config: WhyUsPageConfig | undefined;
  onChange: (next: WhyUsPageConfig) => void;
  brandIcons?: { id: string; imageUrl: string; name?: string }[];
};

function ensureFourPillars(pillars: WhyUsPillar[] | undefined): WhyUsPillar[] {
  const base = Array.isArray(pillars) ? pillars.slice(0, 4) : [];
  const out = base.map((p) => ({ ...p }));
  while (out.length < 4) out.push({});
  return out;
}

export function WhyUsContentEditor({
  config,
  onChange,
  brandIcons = [],
}: WhyUsContentEditorProps) {
  const title = config?.title ?? DEFAULT_WHY_US_TITLE;
  const pillars = ensureFourPillars(config?.pillars);

  const update = (partial: Partial<WhyUsPageConfig>) => {
    onChange({ ...(config ?? {}), ...partial });
  };

  const setPillar = (index: number, patch: Partial<WhyUsPillar>) => {
    const next = pillars.map((p) => ({ ...p }));
    next[index] = { ...next[index], ...patch };
    update({ pillars: next });
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Why Us Content
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            This content is used by all Why Us layout variants; the template only changes the layout.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="whyUs-content-title">
              Title
            </label>
            <input
              id="whyUs-content-title"
              type="text"
              className={inputClass}
              value={title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Why Us"
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            These are the promises you want the homeowner to remember.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Value pillars
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Configure up to four pillars with an optional brand icon, headline, and supporting body copy.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {pillars.map((pillar, index) => (
            <div
              key={index}
              className="space-y-3 rounded-lg border border-zinc-200 bg-white/80 p-3 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Pillar {index + 1}
                </span>
              </div>
              <div className="space-y-2">
                <TemplateCIconPicker
                  icons={brandIcons}
                  value={pillar.iconKey ?? null}
                  onChange={(iconId) => setPillar(index, { iconKey: iconId })}
                  label="Icon"
                />
                <div>
                  <label className={labelClass}>Headline</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={pillar.headline ?? ""}
                    onChange={(e) => setPillar(index, { headline: e.target.value })}
                    placeholder="Short headline"
                  />
                </div>
                <div>
                  <label className={labelClass}>Body</label>
                  <textarea
                    className={textareaClass}
                    rows={3}
                    value={pillar.body ?? ""}
                    onChange={(e) => setPillar(index, { body: e.target.value })}
                    placeholder="Supporting copy"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
