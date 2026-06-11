"use client";

import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import { resolveDeckTheme, type DeckTheme } from "@/app/lib/deck/themes";
import { DeckThemeProvider } from "@/app/lib/deck/theme-context";
import { CoverSlide } from "./CoverSlide";
import { ObjectiveSlide } from "./ObjectiveSlide";
import { InvestmentBySpaceSlide } from "./InvestmentBySpaceSlide";
import { WhyUsSlide } from "./WhyUsSlide";
import { ScopeOverviewSlide } from "./ScopeOverviewSlide";
import { BeforeAfterSlide } from "./BeforeAfterSlide";
import { ScopeBreakdownSlide } from "./ScopeBreakdownSlide";
import { OurProcessSlide } from "./OurProcessSlide";
import { CoreValuesSlide } from "./CoreValuesSlide";
import { TimelineSlide } from "./TimelineSlide";
import { CopeSlide } from "./CopeSlide";
import { OverallInvestmentSlide } from "./OverallInvestmentSlide";
import { NextStepsSlide } from "./NextStepsSlide";
import { ClosingSlide } from "./ClosingSlide";
import { TestimonialsSlide } from "./TestimonialsSlide";
import { DesignBuildSlide } from "./DesignBuildSlide";
import { AdditionOverviewSlide } from "./AdditionOverviewSlide";
import { DesignExperienceSlide } from "./DesignExperienceSlide";
import { FloorPlanSlide } from "./FloorPlanSlide";
import { CraftsmanshipSlide } from "./CraftsmanshipSlide";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  /** When true, a dark brand background is active — flip branding.textColor to light. */
  hasBrandDarkBackground?: boolean;
  /**
   * When true, slide components render editor-only affordances (e.g.
   * empty-photo placeholders). Passed `true` from the admin deck builder;
   * omitted / false from client-facing render paths.
   */
  isEditing?: boolean;
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
export function SlideRenderer({ slide, branding, hasBrandDarkBackground = false, isEditing = false }: Props) {
  const hasAiBackground = !!slide.aiBackground;

  // When a dark brand background is active, override primary text to near-white.
  // Slide components consume branding.textColor for headlines, labels, and body.
  const effectiveBranding: DeckBranding = hasBrandDarkBackground
    ? { ...branding, textColor: DARK_BG_TEXT_COLOR }
    : branding;

  // Resolve the deck theme once and provide it via context to every slide.
  // When a dark brand background is active, derive a dark-aware variant so every
  // theme-consuming slide flips its ink/muted/line to light and lets the dark
  // background show through (surface → transparent) — the theme-layer equivalent
  // of the branding.textColor override above, applied centrally for all slides.
  const baseTheme = resolveDeckTheme(effectiveBranding.deckTheme);
  const theme: DeckTheme = hasBrandDarkBackground
    ? {
        ...baseTheme,
        color: {
          ...baseTheme.color,
          ink: DARK_BG_TEXT_COLOR,
          muted: "rgba(248,244,238,0.72)",
          surface: "transparent",
          line: "rgba(255,255,255,0.18)",
        },
        surface: { ...baseTheme.surface, grid: false },
      }
    : baseTheme;

  const content = (() => {
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
    case "testimonials":
      return <TestimonialsSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "design-build":
      return <DesignBuildSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "addition-overview":
      return <AdditionOverviewSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "design-experience":
      return <DesignExperienceSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "floor-plan":
      return <FloorPlanSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
    case "craftsmanship":
      return <CraftsmanshipSlide slide={slide} branding={effectiveBranding} hasAiBackground={hasAiBackground} />;
      default:
        return (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <p className="text-sm text-zinc-400">Unknown slide type</p>
          </div>
        );
    }
  })();

  return <DeckThemeProvider theme={theme}>{content}</DeckThemeProvider>;
}
