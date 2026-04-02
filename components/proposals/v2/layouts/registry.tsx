import type { PageType } from "../page-model";
import type { ProposalLayoutProps } from "./types";
import {
  CoverHeroImage,
  CoverSplitEditorial,
  CoverEditorialSplit,
  CoverEditorialDarkSplit,
  CoverHeroGlassOverlay,
  CoverImmersiveOverlay,
} from "./cover";
import { ObjectiveStatementLeft, ObjectiveImageRight } from "./objective";
import { ScopeRoomCards, ScopeAlternatingStory } from "./scope";
import { TimelineHorizontalSteps, TimelineProcessCards } from "./timeline";
import { InvestmentTableCallout, InvestmentRangeCards } from "./investment";
import { ClosingSimple, ClosingImageDriven } from "./closing";

type LayoutComponent = React.ComponentType<ProposalLayoutProps>;

const REGISTRY: Record<PageType, Record<string, LayoutComponent>> = {
  cover: {
    "hero-image": CoverHeroImage,
    "split-editorial": CoverSplitEditorial,
    "editorial-dark-split": CoverEditorialDarkSplit,
    "hero-glass-overlay": CoverHeroGlassOverlay,
    "editorial-split": CoverEditorialSplit,
    "immersive-overlay": CoverImmersiveOverlay,
  },
  objective: {
    "statement-left": ObjectiveStatementLeft,
    "image-right": ObjectiveImageRight,
  },
  scope: {
    "room-cards": ScopeRoomCards,
    "alternating-story": ScopeAlternatingStory,
  },
  timeline: {
    "horizontal-steps": TimelineHorizontalSteps,
    "process-cards": TimelineProcessCards,
  },
  investment: {
    "table-callout": InvestmentTableCallout,
    "range-cards": InvestmentRangeCards,
  },
  closing: {
    simple: ClosingSimple,
    "image-driven": ClosingImageDriven,
  },
};

/**
 * Returns the layout component for the given page type and layout key.
 * Falls back to the first registered layout for that type if key is missing.
 */
export function getLayoutComponent(
  type: PageType,
  layoutKey: string
): LayoutComponent | null {
  const byType = REGISTRY[type];
  if (!byType) return null;
  const Component = byType[layoutKey] ?? Object.values(byType)[0];
  return Component ?? null;
}
