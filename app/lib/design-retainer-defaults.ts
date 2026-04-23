import type { DesignRetainerContent } from "@/app/lib/deck/types";

export const DEFAULT_DESIGN_RETAINER_BENEFITS: string[] = [
  "Full architectural design and space planning",
  "HOA / ARB submission and approval management",
  "Complete material and finish specifications",
  "Fixed-price build contract before construction begins",
];

// Phase 8C: defaults now target the three-band-summary layout.
// Section label + headline renamed to 'YOUR INVESTMENT' / 'Your Investment'
// so a Reset-to-defaults click in InspectorPanel lands on the new copy.
// The retainerAmount value is a placeholder — syncRetainerFromProject
// computes and writes the real number on the next deck load.
//
// Phase 8C T8: renamed from HHI_DESIGN_RETAINER_DEFAULTS → DESIGN_RETAINER_DEFAULTS
// as part of the tenant-reference cleanup. The values here are already
// tenant-neutral; only the constant name carried the legacy brand prefix.
export const DESIGN_RETAINER_DEFAULTS: {
  defaultLayout: "three-band-summary";
  defaultSectionLabel: string;
  defaultHeadline: string;
  defaultTagline: string;
  defaultRetainerAmount: string;
  defaultBenefits: string[];
} = {
  defaultLayout: "three-band-summary",
  defaultSectionLabel: "YOUR INVESTMENT",
  defaultHeadline: "Your Investment",
  defaultTagline: "Your investment in certainty before construction begins.",
  defaultRetainerAmount: "$22,000",
  defaultBenefits: DEFAULT_DESIGN_RETAINER_BENEFITS,
};
