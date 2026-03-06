import type { WhyUsPillar } from "@/app/lib/layout-config";

/** Default page title when none is set (SaaS-friendly, no HHI branding). */
export const DEFAULT_WHY_US_TITLE = "Why Us";

/** Generic placeholder pillars for editor only (no HHI content). Used for placeholder text. */
export const DEFAULT_WHY_US_PILLARS: WhyUsPillar[] = [
  { iconKey: null, headline: "", body: "" },
  { iconKey: null, headline: "", body: "" },
  { iconKey: null, headline: "", body: "" },
  { iconKey: null, headline: "", body: "" },
];
