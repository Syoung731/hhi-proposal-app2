import type { DesignRetainerContent } from "@/app/lib/deck/types";

export const DEFAULT_DESIGN_RETAINER_BENEFITS: string[] = [
  "Full architectural design and space planning",
  "HOA / ARB submission and approval management",
  "Complete material and finish specifications",
  "Fixed-price build contract before construction begins",
];

export const HHI_DESIGN_RETAINER_DEFAULTS: {
  defaultLayout: "centered-hero";
  defaultSectionLabel: string;
  defaultHeadline: string;
  defaultTagline: string;
  defaultRetainerAmount: string;
  defaultBenefits: string[];
} = {
  defaultLayout: "centered-hero",
  defaultSectionLabel: "DESIGN RETAINER",
  defaultHeadline: "Your Design Retainer",
  defaultTagline: "Your investment in certainty before construction begins.",
  defaultRetainerAmount: "$22,000",
  defaultBenefits: DEFAULT_DESIGN_RETAINER_BENEFITS,
};
