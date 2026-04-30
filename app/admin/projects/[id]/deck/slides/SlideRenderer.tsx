"use client";

import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import { CoverSlide } from "./CoverSlide";
import { ObjectiveSlide } from "./ObjectiveSlide";
import { InvestmentBySpaceSlide } from "./InvestmentBySpaceSlide";
import { WhyUsSlide } from "./WhyUsSlide";
import { ScopeOverviewSlide } from "./ScopeOverviewSlide";
import { BeforeAfterSlide } from "./BeforeAfterSlide";
import { ScopeBreakdownSlide } from "./ScopeBreakdownSlide";
import { RiskBriefSlide } from "./RiskBriefSlide";
import { OurProcessSlide } from "./OurProcessSlide";
import { CoreValuesSlide } from "./CoreValuesSlide";
import { TimelineSlide } from "./TimelineSlide";
import { CopeSlide } from "./CopeSlide";
import { OverallInvestmentSlide } from "./OverallInvestmentSlide";
import { NextStepsSlide } from "./NextStepsSlide";
import { ClosingSlide } from "./ClosingSlide";
import { InspirationSlide } from "./InspirationSlide";
import { TestimonialsSlide } from "./TestimonialsSlide";
import { DesignBuildSlide } from "./DesignBuildSlide";
import { AdditionOverviewSlide } from "./AdditionOverviewSlide";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  /** When true, a dark brand background is active — flip branding.textColor to light. */
  hasBrandDarkBackground?: boolean;
}

/** Light text color used on dark brand backgrounds. */
const DARK_BG_TEXT_COLOR = "#F8F4EE";

/**
 * Render the correct slide component for a given slide type.
 *
 * Background layering (aiBackground, brand bg) is handled by SlideCanvas —
 * SlideRenderer is a pure content pass-through.
 *
 * hasAiBackground is forwarded so each slide root uses background:transparent,
 * letting the SlideCanvas background layers show through.
 *
 * hasBrandDarkBackground overrides branding.textColor → DARK_BG_TEXT_COLOR so
 * all 9 slide components automatically use light text without individual edits.
 * The accentColor (#F47216) is intentionally preserved — orange reads well on dark.
 */
export function SlideRenderer({ slide, branding, hasBrandDarkBackground = false }: Props) {
  const hasAiBackground = !!slide.aiBackground;

  // When a dark brand background is active, override primary text to near-white.
  // Slide components consume branding.textColor for headlines, labels, and body.
  const effectiveBranding: DeckBranding = hasBrandDarkBackground
    ? { ...branding, textColor: DARK_BG_TEXT_COLOR }
    : branding;

  switch (slide.type) {
    case "cover":
      return <CoverSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "objective":
      return <ObjectiveSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "investment-by-space":
      return <InvestmentBySpaceSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "why-us":
      return <WhyUsSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "scope-overview":
      return <ScopeOverviewSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "before-after":
      return <BeforeAfterSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "scope-breakdown":
      return <ScopeBreakdownSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "risk-brief":
      return <RiskBriefSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "our-process":
      return <OurProcessSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "core-values":
      return <CoreValuesSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "timeline":
      return <TimelineSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "cope":
      return <CopeSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "overall-investment":
      return <OverallInvestmentSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "next-steps":
      return <NextStepsSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "closing":
      return <ClosingSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "inspiration":
      return <InspirationSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "testimonials":
      return <TestimonialsSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "design-build":
      return <DesignBuildSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "addition-overview":
      return <AdditionOverviewSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    default:
      return (
        <div className="w-full h-full flex items-center justify-center bg-white">
          <p className="text-sm text-zinc-400">Unknown slide type</p>
        </div>
      );
  }
}
