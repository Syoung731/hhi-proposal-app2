"use client";

import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import { CoverSlide } from "./CoverSlide";
import { ObjectiveSlide } from "./ObjectiveSlide";
import { InvestmentSlide } from "./InvestmentSlide";
import { WhyUsSlide } from "./WhyUsSlide";
import { ScopeOverviewSlide } from "./ScopeOverviewSlide";
import { BeforeAfterSlide } from "./BeforeAfterSlide";
import { ScopeBreakdownSlide } from "./ScopeBreakdownSlide";
import { RiskBriefSlide } from "./RiskBriefSlide";
import { ProcessSlide } from "./ProcessSlide";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
}

/**
 * Slide renderer registry.
 * Routes a slide to the correct renderer by type.
 * Add new slide types here as Phase 2 expands.
 */
export function SlideRenderer({ slide, branding }: Props) {
  switch (slide.type) {
    case "cover":
      return <CoverSlide slide={slide} branding={branding} />;
    case "objective":
      return <ObjectiveSlide slide={slide} branding={branding} />;
    case "investment":
      return <InvestmentSlide slide={slide} branding={branding} />;
    case "why-us":
      return <WhyUsSlide slide={slide} branding={branding} />;
    case "scope-overview":
      return <ScopeOverviewSlide slide={slide} branding={branding} />;
    case "before-after":
      return <BeforeAfterSlide slide={slide} branding={branding} />;
    case "scope-breakdown":
      return <ScopeBreakdownSlide slide={slide} branding={branding} />;
    case "risk-brief":
      return <RiskBriefSlide slide={slide} branding={branding} />;
    case "process":
      return <ProcessSlide slide={slide} branding={branding} />;
    default:
      return (
        <div className="w-full h-full flex items-center justify-center bg-white">
          <p className="text-sm text-zinc-400">Unknown slide type</p>
        </div>
      );
  }
}
