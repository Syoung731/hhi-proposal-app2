/**
 * Default content for the Why Us "comparison" layouts (comparison-table /
 * comparison-columns / comparison-cards). Seeded from the NotebookLM
 * "HHI Standard vs. Traditional Builders" reference and the retired Risk Brief
 * messaging. Used by the slide fallback, the inspector "Reset", and seeding.
 */

import type { WhyUsComparisonRow } from "./types";

export const WHY_US_COMPARISON_DEFAULTS = {
  headline: "The HHI Standard vs. Traditional Builders",
  leftHeader: "Traditional Builders",
  rightHeader: "The HHI Standard",
  bottom:
    "You'll know exactly what's being built, what it costs, and what to expect — before construction starts.",
} as const;

export const DEFAULT_WHY_US_COMPARISON_ROWS: WhyUsComparisonRow[] = [
  {
    id: "cmp-materials",
    label: "Materials",
    traditional: "Hidden markups on finish materials.",
    hhiTitle: "Zero Mark-up",
    hhi: "You pay exactly what we pay; our value is in precision management.",
  },
  {
    id: "cmp-budget",
    label: "Budget Accuracy",
    traditional: "Unexpected change orders mid-build.",
    hhiTitle: "Zero Change Order Guarantee",
    hhi: "Preconstruction feasibility uncovers challenges before we build.",
  },
  {
    id: "cmp-constructability",
    label: "Constructability",
    traditional: "Designed in a vacuum, often exceeding budget limits.",
    hhiTitle: "Real-World Design",
    hhi: "Design-build integration ensures your plans match your exact budget.",
  },
  {
    id: "cmp-ownership",
    label: "Design Ownership",
    traditional: "Locked into a build contract just to get drawings.",
    hhiTitle: "Total Freedom",
    hhi: "You own your collaborative design, with zero obligation.",
  },
];
