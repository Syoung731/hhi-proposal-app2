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
    "why-us": "Why HHI",
    "design-build": "Design-Build Advantage",
    "core-values": "Our Values",
    "our-process": "Our Process",
    timeline: "Timeline",
    testimonials: "Testimonials",
    cope: "Project Execution",
    "investment-by-space": "Investment",
    "overall-investment": "Overall Investment",
    "next-steps": "Next Steps",
    closing: "Thank You",
    "addition-overview": "Overview",
    "design-experience": "Design Experience",
    "floor-plan": "Project Footprint",
    craftsmanship: "Craftsmanship",
  };

  return typeLabels[slide.type] ?? `Slide ${index + 1}`;
}
