/**
 * Browser-safe hero preset definitions. No server code — safe to import in client components.
 */

export const HERO_PRESETS = [
  "remove_watermark",
  "brighten",
  "contrast",
  "straighten",
  "crop_16_9",
  "clean_distractions",
  "sharpen",
] as const;

export type HeroPresetKey = (typeof HERO_PRESETS)[number];

export const HERO_PRESET_LABELS: Record<HeroPresetKey, string> = {
  remove_watermark: "Remove text / watermark",
  brighten: "Brighten photo",
  contrast: "Increase contrast",
  straighten: "Straighten / level",
  crop_16_9: "Crop for cover (16:9)",
  clean_distractions: "Clean up distractions (minor)",
  sharpen: "Sharpen / clarity",
};
