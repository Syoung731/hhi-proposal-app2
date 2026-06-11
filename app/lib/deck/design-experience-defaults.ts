/**
 * Default content for the Design Experience (project journey) slide.
 *
 * Mirrors HHI's actual design-phase sequence: as-built → refinement →
 * documentation → selections → fixed-price contract. Used by the deck seeder
 * and the inspector "Reset to Defaults" button. Icons reference the built-in
 * COPE vector set (see COPE_BUILTIN_ICONS in CopeSlide.tsx); the user can swap
 * in brand or AI-generated icons per stage.
 */

import type { DesignExperienceStage } from "./types";

export const DESIGN_EXPERIENCE_DEFAULTS = {
  sectionLabel: "WHAT TO EXPECT",
  headline: "Your Design Experience",
  subheadline:
    "A rigorous, collaborative process that drives success — ensuring zero surprises.",
  stepWord: "Stage",
} as const;

export const DEFAULT_DESIGN_EXPERIENCE_STAGES: DesignExperienceStage[] = [
  {
    id: "stage-asbuilt",
    title: "As-Built & First Proposal",
    description:
      "We document existing conditions and present your first design concept with a preliminary budget.",
    icon: "measure",
    iconUrl: "/deck-icons/measure.png",
  },
  {
    id: "stage-refinement",
    title: "Refinement & Redlines",
    description:
      "Collaborative redline meetings with your project director to refine the vision.",
    icon: "feasibility",
    iconUrl: "/deck-icons/feasibility.png",
  },
  {
    id: "stage-documentation",
    title: "Construction Documentation",
    description:
      "Construction documentation and plan finalization, with engineers consulted as needed.",
    icon: "documentation",
    iconUrl: "/deck-icons/documentation.png",
  },
  {
    id: "stage-selections",
    title: "Specifications & Selections",
    description:
      "Material specifications and selections are finalized and uploaded to your client portal.",
    icon: "selections",
    iconUrl: "/deck-icons/selections.png",
  },
  {
    id: "stage-contract",
    title: "Final Budget & Fixed-Price Contract",
    description:
      "We review the final budget, create your build contract with our Fixed-Price Guarantee, and apply for permits.",
    icon: "contract",
    iconUrl: "/deck-icons/contract.png",
  },
];
