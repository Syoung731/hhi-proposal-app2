/**
 * Page model for the modular proposal viewer (view-v2).
 * Each proposal is composed of an ordered list of pages; each page has a type and layout variant.
 */

export const PAGE_TYPES = [
  "cover",
  "objective",
  "scope",
  "timeline",
  "investment",
  "closing",
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

/** Layout keys per page type. Registry will map type+layoutKey to a component. */
export const LAYOUT_KEYS: Record<PageType, readonly string[]> = {
  cover: ["hero-image", "split-editorial", "editorial-dark-split", "hero-glass-overlay"],
  objective: ["statement-left", "image-right"],
  scope: ["room-cards", "alternating-story"],
  timeline: ["horizontal-steps", "process-cards"],
  investment: ["table-callout", "range-cards"],
  closing: ["simple", "image-driven"],
};

export type LayoutKeyFor<T extends PageType> = (typeof LAYOUT_KEYS)[T][number];

/** Optional overrides a page can pass to its layout (e.g. custom title). */
export type PageOverrides = Record<string, unknown>;

/**
 * Data source hint for where the layout should pull data from.
 * Default is snapshot-derived section props; can be overridden per page later.
 */
export type PageDataSource = "snapshot" | "custom" | string;

export type ProposalPage = {
  id: string;
  type: PageType;
  layoutKey: string;
  order: number;
  isEnabled: boolean;
  title?: string | null;
  dataSource?: PageDataSource | null;
  overrides?: PageOverrides | null;
};

/** Ordered list of pages for a proposal. Load from admin page-builder or use mock. */
export type ProposalPageConfig = ProposalPage[];
