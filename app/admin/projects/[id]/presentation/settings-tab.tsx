"use client";

import type {
  PresentationConfigSaved,
  PresentationSettings,
} from "@/app/lib/layout-config";
import { DEFAULT_PRESENTATION_SETTINGS } from "./types";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const radioGroupClass = "flex flex-wrap gap-3";

type SettingsTabProps = {
  config: PresentationConfigSaved;
  onConfigChange: (config: PresentationConfigSaved) => void;
};

const BACKGROUND_OPTIONS: { id: PresentationSettings["background"]; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "warm", label: "Warm" },
  { id: "imageOverlay", label: "Image overlay" },
];

const TRANSITION_OPTIONS: { id: PresentationSettings["transition"]; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
];

const SPEED_OPTIONS: { id: PresentationSettings["speed"]; label: string }[] = [
  { id: "slow", label: "Slow" },
  { id: "normal", label: "Normal" },
  { id: "fast", label: "Fast" },
];

export function SettingsTab({
  config,
  onConfigChange,
}: SettingsTabProps) {
  const settings = config.settings ?? DEFAULT_PRESENTATION_SETTINGS;
  const background = settings.background ?? DEFAULT_PRESENTATION_SETTINGS.background;
  const transition = settings.transition ?? DEFAULT_PRESENTATION_SETTINGS.transition;
  const speed = settings.speed ?? DEFAULT_PRESENTATION_SETTINGS.speed;

  const updateSettings = (partial: Partial<PresentationSettings>) => {
    onConfigChange({
      ...config,
      settings: {
        ...settings,
        ...partial,
      },
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Presentation Settings
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Background, page transition, and speed for live viewing. Changes apply in the public viewer.
      </p>

      <div>
        <span className={labelClass}>Background</span>
        <div className={radioGroupClass} role="radiogroup" aria-label="Background">
          {BACKGROUND_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-100 dark:border-zinc-600 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-800"
            >
              <input
                type="radio"
                name="settings-background"
                value={opt.id}
                checked={background === opt.id}
                onChange={() => updateSettings({ background: opt.id })}
                className="h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClass}>Page transition</span>
        <div className={radioGroupClass} role="radiogroup" aria-label="Page transition">
          {TRANSITION_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-100 dark:border-zinc-600 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-800"
            >
              <input
                type="radio"
                name="settings-transition"
                value={opt.id}
                checked={transition === opt.id}
                onChange={() => updateSettings({ transition: opt.id })}
                className="h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClass}>Speed</span>
        <div className={radioGroupClass} role="radiogroup" aria-label="Transition speed">
          {SPEED_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-100 dark:border-zinc-600 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-800"
            >
              <input
                type="radio"
                name="settings-speed"
                value={opt.id}
                checked={speed === opt.id}
                onChange={() => updateSettings({ speed: opt.id })}
                className="h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
