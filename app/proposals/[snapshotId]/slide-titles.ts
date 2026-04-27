import type { ProposalSlide } from "@/app/lib/deck/types";

/**
 * Derive a client-friendly title for a slide — used in the drawer nav and
 * hash deep-link anchors. Falls back to the slide type if no explicit
 * headline is set.
 */
export function slideTitle(slide: ProposalSlide, index: number): string {
  if (slide.headline && slide.headline.trim()) return slide.headline.trim();

  // Fallbacks by type for slides that don't carry a free-form headline.
  const typeLabels: Record<string, string> = {
    cover: "Cover",
    objective: "Project Objective",
    "scope-overview": "Scope",
    "scope-breakdown": "Scope Breakdown",
    "before-after": "Before & After",
    "visual-inspiration": "Inspiration",
    "why-us": "Why HHI",
    "design-build-advantage": "Design-Build Advantage",
    "core-values": "Our Values",
    "risk-brief": "Risk Brief",
    process: "Our Process",
    "project-timeline": "Timeline",
    "client-testimonials": "Testimonials",
    "cope-page": "Project Execution",
    investment: "Investment",
    "design-retainer": "Overall Investment",
    "next-steps": "Next Steps",
    "closing-slide": "Thank You",
    "addition-overview": "Overview",
  };

  return typeLabels[slide.type] ?? `Slide ${index + 1}`;
}
