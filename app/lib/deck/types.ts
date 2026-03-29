// ─────────────────────────────────────────────────────────────────────────────
// Deck Data Model
// Phase 1: cover | objective | investment
// ─────────────────────────────────────────────────────────────────────────────

export type SlideType = "cover" | "objective" | "investment" | "why-us" | "scope-overview" | "before-after" | "scope-breakdown" | "risk-brief" | "process";

// ─── Text Zone Types ────────────────────────────────────────────────────────

/** Normalized 0–1 coordinates, cached on BrandBackground.textZoneSuggestion */
export type TextZoneSuggestion = {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;                         // normalized 0–1, default 0.04
  textAlign: "left" | "center" | "right";
  recommendedTextColor: "light" | "dark";
  confidence: number;                      // 0–1
  source: "derived" | "ai-vision";
  analyzedAt: string;                      // ISO timestamp
};

/** Per-slide user-editable zone, stored on DeckSlide.textZone */
export type TextZoneSetting = {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;                         // normalized 0–1, default 0.04
  textAlign: "left" | "center" | "right";
  textColor: "light" | "dark";
  isManualOverride: boolean;
};

// Layout keys per slide type
export type CoverLayoutKey =
  | "hero-image"
  | "split-editorial"
  | "right-panel-overlay"
  | "split-dark-editorial"
  | "bottom-card-overlay";
export type ObjectiveLayoutKey =
  | "statement-left"
  | "dark-statement"
  | "executive-summary"
  | "blueprint-overlay";
export type InvestmentLayoutKey = "table-callout";
export type WhyUsLayoutKey =
  | "pillars-grid"
  | "editorial-cards"
  | "stacked-list"
  | "testimonials-split";
export type ScopeOverviewLayoutKey = "split-panel" | "image-row";
export type BeforeAfterLayoutKey = "side-by-side" | "after-emphasis";
export type ScopeBreakdownLayoutKey = "text-grid";
export type RiskBriefLayoutKey = "two-column" | "comparison-table";
export type ProcessLayoutKey = "three-stages";
export type SlideLayoutKey =
  | CoverLayoutKey
  | ObjectiveLayoutKey
  | InvestmentLayoutKey
  | WhyUsLayoutKey
  | ScopeOverviewLayoutKey
  | BeforeAfterLayoutKey
  | ScopeBreakdownLayoutKey
  | RiskBriefLayoutKey
  | ProcessLayoutKey;

// ─── Branding ────────────────────────────────────────────────────────────────

/** Deck-ready branding shape — sourced from CompanySettings. */
export interface DeckBranding {
  logoLightUrl: string | null; // Logo for light-background slides
  logoDarkUrl: string | null; // Logo for dark/photo-heavy slides
  accentColor: string; // e.g. "#E87722"
  textColor: string; // e.g. "#18181B"
  companyName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

// ─── Slide Content Shapes ────────────────────────────────────────────────────

export interface SlideMedia {
  id: string;
  url: string;
  caption?: string | null;
}

/** Per-slide logo position + scale override for cover slides. */
export interface LogoOverride {
  /** % from left of the logo's reference zone. Clamped 0–90 at render time. */
  x: number;
  /** % from top of the logo's reference zone. Clamped 0–90 at render time. */
  y: number;
  /** Scale multiplier. Clamped 0.5–5.0 at render time. Default: 1.0. */
  scale: number;
}

export interface CoverContent {
  heroImageUrl?: string | null;
  preparedFor?: string | null;
  tagline?: string | null;
  date?: string | null;
  /** right-panel-overlay: which side the panel sits on. Default: "right". */
  overlayPosition?: "left" | "right";
  /** bottom-card-overlay: which corner the card anchors to. Default: "bottom-left". */
  cardPosition?: "bottom-left" | "bottom-right";
  /**
   * Custom logo position + scale. When null/undefined each layout uses its
   * built-in default. Coordinates are % within the logo's reference zone
   * (the panel for panel-based layouts; the full slide for overlay layouts).
   */
  logoOverride?: LogoOverride | null;
}

export interface ObjectiveContent {
  statementText?: string | null;
  supportingText?: string | null;
  bullets?: string[];
  // ── Text styling ──────────────────────────────────────────────────────────
  headlineSize?: number | null;
  headlineColor?: string | null;
  headlineOutline?: string | null;
  statementSize?: number | null;
  statementColor?: string | null;
  statementOutline?: string | null;
  supportingSize?: number | null;
  supportingColor?: string | null;
  bulletColor?: string | null;
  // ── Text block position & size (0–1 normalised) ─────────────────────────
  textX?: number | null;
  textY?: number | null;
  /** Width of the text block as a percentage of slide width (1–100). Default varies by layout. */
  textWidth?: number | null;
  // ── Card (background panel behind text block) ────────────────────────────
  showCard?: boolean | null;
  cardColor?: string | null;   // hex, default "#000000"
  cardOpacity?: number | null; // 0–100, default 60
}

export interface InvestmentLineItem {
  id: string;
  label: string;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  isCope?: boolean; // Cost of Project Execution — light row style
}

export interface InvestmentContent {
  lineItems?: InvestmentLineItem[];
  retainerLabel?: string | null;
  retainerAmount?: number | null;
  disclaimer?: string | null;
  address?: string | null;
}

/** A single client testimonial for use in the testimonials-split layout. */
export interface WhyUsTestimonial {
  id: string;
  quote: string;
  author: string;
  location?: string | null;
}

/** A single value pillar resolved from the DB for use in a slide. */
export interface WhyUsPillarItem {
  id: string;
  title: string;
  body: string;
  /** Public URL of the BrandIcon PNG. Null if no icon was assigned. */
  iconUrl: string | null;
}

/**
 * Content shape for why-us slides.
 * Pillars are baked in at deck-load time from the ValuePillar table so the
 * slide renderer is fully self-contained — no extra props required.
 */
export interface WhyUsContent {
  /** Section heading shown above the grid. Falls back to slide.headline. */
  sectionTitle?: string | null;
  /**
   * All available pillars resolved from the DB at page load.
   * Refreshes each time the deck editor page is opened.
   */
  pillars?: WhyUsPillarItem[];
  /**
   * IDs of the pillars to display on this slide.
   * Empty array or absent = show ALL pillars in content.pillars.
   */
  selectedPillarIds?: string[];
  /**
   * Testimonials for the testimonials-split layout.
   * When absent or empty the layout falls back to built-in stub quotes so
   * the slide always looks complete. Wire real project reviews here in Phase 2.
   */
  testimonials?: WhyUsTestimonial[];
}

/**
 * A photo selected from the Photo Library for use in a scope-overview slide.
 * We snapshot url + thumbnailUrl at selection time so the renderer is
 * self-contained and never needs a round-trip to resolve IDs.
 */
export interface ScopeOverviewSelectedPhoto {
  /** LibraryMedia.id — kept for future reference / dedup */
  id: string;
  /** Full-resolution public URL (R2) */
  url: string;
  /** Optional thumbnail URL — used for the inspector thumbnail grid */
  thumbnailUrl: string | null;
}

/**
 * Content shape for scope-overview slides.
 * title maps to slide.headline.
 * Images are selected via the Photo Library picker and stored as
 * ScopeOverviewSelectedPhoto[] so the renderer is fully self-contained.
 */
export interface ScopeOverviewContent {
  /** 3–4 sentence description of the project scope. */
  description?: string | null;
  /**
   * Photos chosen via the Library Media Picker.
   * split-panel renders the first 2; image-row renders up to 4.
   */
  selectedPhotos?: ScopeOverviewSelectedPhoto[];
  /** Title font-size multiplier (0.5–3.0). Default 1.5. */
  titleSize?: number | null;
  /** Title text color (hex). */
  titleColor?: string | null;
  /** Title horizontal position on slide (0–1). */
  titleX?: number | null;
  /** Title vertical position on slide (0–1). */
  titleY?: number | null;
  /** Description/copy font-size multiplier (0.5–3.0). Default 1.5. */
  copySize?: number | null;
  /** Description/copy text color (hex). */
  copyColor?: string | null;
  /** Copy horizontal position on slide (0–1). */
  copyX?: number | null;
  /** Copy vertical position on slide (0–1). */
  copyY?: number | null;
}

/**
 * A single media item from a project room, shaped for deck editor use.
 * Sourced from Media model: type=EXISTING (before) or type=RENDERING+renderStatus=DONE (render).
 */
export interface RoomMediaItem {
  id: string;
  url: string;
  kind: string | null;         // MediaKind enum value, e.g. "BEFORE", "AFTER"
  renderStatus: string | null; // RenderStatus enum value, e.g. "DONE"
  caption: string | null;
}

/**
 * A project room with its before and render media pre-resolved.
 * Passed from the SSR page.tsx into the deck editor to power the
 * BeforeAfterInspector without requiring additional client-side fetches.
 */
export interface RoomWithMedia {
  id: string;
  name: string;
  sortOrder: number;
  /** Media.id of the room's user-selected render for proposal use. May be null. */
  selectedRenderMediaId: string | null;
  /** Room.scopeNarrative — used to auto-populate caption text on generated slides. */
  scopeNarrative?: string;
  /** Uploaded/existing photos for this room (type=EXISTING, excludes HERO). */
  beforeMedia: RoomMediaItem[];
  /** Completed AI renders for this room (type=RENDERING, renderStatus=DONE). */
  renderMedia: RoomMediaItem[];
}

/**
 * A single room entry on a scope-breakdown slide.
 * Snapshotted from Room at auto-gen time; description is user-editable afterward.
 */
export interface ScopeBreakdownRoom {
  /** Room.id — used for dedup and refresh. */
  id: string;
  /** Snapshotted from Room.name. */
  name: string;
  /** Short scope description — auto-populated from scopeNarrative, then freely editable. */
  description: string;
  /** Whether this room is currently shown on the slide. */
  isIncluded: boolean;
}

/**
 * Content shape for scope-breakdown slides.
 * Represents project areas that do NOT have a selected proposal render.
 * Photos are optional supporting images from the Library (not room-specific).
 */
export interface ScopeBreakdownContent {
  /** Slide heading. Falls back to slide.headline. Default: "Additional Areas Included". */
  title?: string | null;
  /** Intro paragraph shown below the title. */
  introText?: string | null;
  /** Room items baked in at auto-gen time. Each room is independently toggleable. */
  rooms?: ScopeBreakdownRoom[];
  /**
   * Optional supporting photos from the Library Media Picker.
   * Rendered as a horizontal photo strip at the bottom of the slide.
   * Up to 4 photos.
   */
  photos?: ScopeOverviewSelectedPhoto[];
}

/**
 * Content shape for risk-brief slides.
 * Two-column problem/solution layout with a bottom statement.
 */
export interface RiskBriefContent {
  /** Left column header. two-column default: "Why Remodels Go Wrong". comparison-table default: "Traditional Contracting". */
  leftHeader?: string | null;
  /** Problem bullet points (left column). */
  leftBullets?: string[];
  /** Right column header. two-column default: "How We Prevent That". comparison-table default: "HHI Design-Build". */
  rightHeader?: string | null;
  /** Solution bullet points (right column). */
  rightBullets?: string[];
  /** Full-width closing statement shown at the bottom of the slide. */
  bottomStatement?: string | null;
  /**
   * Optional row category labels shown to the left of the table in comparison-table layout.
   * E.g. ["Accountability", "Budgeting", "Design", "Transparency"].
   * Omit to hide the label column.
   */
  rowLabels?: string[];
  /** Body copy font-size multiplier (0.5–3.0). Default 1.5. */
  bodySize?: number | null;
  /** Left column/panel box background color (hex). Applied when a brand background is set. */
  leftBoxColor?: string | null;
  /** Right column/panel box background color (hex). Applied when a brand background is set. */
  rightBoxColor?: string | null;
  /** Slide title font-size multiplier (0.5–3.0). Default 1.5. */
  titleSize?: number | null;
  /** Slide title text color (hex). */
  titleColor?: string | null;
  /** Bottom statement font-size multiplier (0.5–3.0). Default 1.5. */
  bottomSize?: number | null;
  /** Bottom statement text color (hex). */
  bottomColor?: string | null;
  /** Title text outline color (hex). null = no outline. */
  titleTextOutline?: string | null;
  /** Box header font-size multiplier (0.5–3.0). Default 1.5. */
  headerSize?: number | null;
  /** Box header text color (hex). Applied to the header labels inside each box. */
  headerTextColor?: string | null;
  /** Box header text outline color (hex). null = no outline. */
  headerTextOutline?: string | null;
  /** Whether row category labels are shown (comparison-table only). Default false. */
  showRowLabels?: boolean | null;
  /** ✕ cross icon color (hex). */
  crossColor?: string | null;
  /** ✓ check icon / circle color (hex). */
  checkColor?: string | null;
  /** Icon size multiplier (0.5–3.0). Default 1.5. */
  iconSize?: number | null;
  /** Icon outline color (hex). null = no outline. */
  iconOutline?: string | null;
  /** Body bullet text color (hex). Applied to all bullet copy inside the boxes. */
  bodyTextColor?: string | null;
  /** Body text outline color (hex). null = no outline. */
  bodyTextOutline?: string | null;
  /** Bottom statement text outline color (hex). null = no outline. */
  bottomTextOutline?: string | null;
}

/** A single stage in a process slide. */
export interface ProcessStage {
  name: string;
  bullets: string[];
}

/**
 * Content shape for process slides.
 * Three sequential stages presented left-to-right.
 */
export interface ProcessContent {
  /** The three stages of the process. */
  stages?: ProcessStage[];
  /** Full-width closing statement at the bottom. */
  bottomStatement?: string | null;
}

/**
 * Content shape for before-after slides.
 * IDs reference project Media records; URLs are snapshotted at selection time
 * so the renderer is fully self-contained.
 */
export interface BeforeAfterContent {
  /** ID of the project room this slide represents. */
  roomId?: string | null;
  /** Room display name — snapshotted from Room.name at selection time. */
  roomName?: string | null;
  /** Media.id of the chosen before photo. */
  beforeMediaId?: string | null;
  /** Media.id of the chosen after/render photo. */
  afterMediaId?: string | null;
  /** Snapshotted URL for the before image (self-contained render). */
  beforeImageUrl?: string | null;
  /** Snapshotted URL for the after/render image (self-contained render). */
  afterImageUrl?: string | null;
  /** Optional slide caption shown below the images. */
  caption?: string | null;
  /** Heading font size in em units (0.8–3.0). Default ~1.55. */
  headingFontSize?: number | null;
  /** Caption/body font size in em units (0.4–1.2). Default ~0.6. */
  captionFontSize?: number | null;
  /** Heading hex color override. Null = use branding default. */
  headingColor?: string | null;
  /** Caption hex color override. Null = use layout default. */
  captionColor?: string | null;
  /** Logo size in em units (0.5–8.0). Default 4.0. */
  logoSize?: number | null;
  /** Logo horizontal position, 0 = left edge … 1 = right edge. Default 0.85. */
  logoX?: number | null;
  /** Logo vertical position, 0 = top edge … 1 = bottom edge. Default 0.88. */
  logoY?: number | null;
  /** Which logo variant to display. Default "light". */
  logoVariant?: "light" | "dark" | null;
}

export type SlideContent =
  | CoverContent
  | ObjectiveContent
  | InvestmentContent
  | WhyUsContent
  | ScopeOverviewContent
  | BeforeAfterContent
  | ScopeBreakdownContent
  | RiskBriefContent
  | ProcessContent;

// ─── Slide ───────────────────────────────────────────────────────────────────

export interface ProposalSlide {
  id: string;
  type: SlideType;
  layoutKey: SlideLayoutKey;
  order: number;
  isEnabled: boolean;
  /** Primary headline shown on the slide */
  headline?: string | null;
  /** Secondary headline / subtitle */
  subheadline?: string | null;
  /** Rich body copy (objective statement, etc.) */
  body?: string | null;
  /** Structured content specific to slide type */
  content?: SlideContent;
  /** Optional media references */
  media?: SlideMedia[];
  /** Per-slide style overrides — placeholder for Phase 2 */
  styleOverrides?: Record<string, string>;
  /** Flag for Phase 2 AI editing support */
  aiEditable?: boolean;
  /** When true, this slide cannot be reordered or removed by the user. */
  isLocked?: boolean;
  /**
   * "first" → slide must always remain at index 0 (e.g. Cover).
   * "last"  → slide must always remain at the final position (e.g. Closing).
   */
  lockPosition?: "first" | "last";
  /**
   * "auto"   = generated by the sync engine from project room data.
   * "manual" = user-created (default).
   */
  source?: "auto" | "manual";
  /**
   * When true, this auto-generated slide was dismissed by the user.
   * The sync engine will not recreate it even if the source data is present.
   */
  isUserHidden?: boolean;
  /**
   * When true, the user has manually edited an auto-generated slide.
   * The sync engine will preserve the slide content without overwriting.
   */
  isUserModified?: boolean;
  /** Optional section grouping identifier. */
  sectionId?: string | null;
  /**
   * Optional reference to a BrandBackground.id.
   * When set, the slide renderer can use this background as a full-bleed or
   * composited background instead of its default styling.
   *
   * Intended use path (Phase 2):
   * - "subtle-texture" / "blueprint-overlay" backgrounds → overlay on top of slide base color
   * - "slide-visual" backgrounds → full-bleed image fill behind slide content
   *
   * Not yet consumed by any slide renderer. The inspector and save/load plumbing
   * is the next step before wiring individual slide types.
   */
  backgroundId?: string | null;
  /**
   * Per-slide text zone override. When set, slide renderers that support text
   * zone positioning will absolutely-position their content within this zone.
   * When null/undefined the renderer falls back to its built-in layout.
   */
  textZone?: TextZoneSetting | null;
}

// ─── Deck ────────────────────────────────────────────────────────────────────

export interface ProposalDeck {
  id: string;
  /** Linked proposal/project ID */
  proposalId: string;
  projectTitle: string;
  clientName?: string | null;
  address?: string | null;
  slides: ProposalSlide[];
}

// ─── Layout Registry ─────────────────────────────────────────────────────────

/**
 * Sensible default logo position per cover layout.
 * These seed the inspector sliders when no override exists yet.
 * bottom-card-overlay x is adjusted at runtime based on cardPosition.
 */
/**
 * Default logo positions expressed as % of the FULL SLIDE (not the panel).
 * This matches the override coordinate space — the logo is always rendered
 * at the slide root level so it stays above all other layers.
 * bottom-card-overlay x is adjusted at runtime based on cardPosition.
 */
export const LOGO_DEFAULTS: Record<CoverLayoutKey, LogoOverride> = {
  //                               approximate visual position within layout
  "hero-image":           { x: 62, y: 7,  scale: 1.0 }, // top-left of right panel
  "split-editorial":      { x: 80, y: 6,  scale: 1.0 }, // top-right of full slide
  "right-panel-overlay":  { x: 68, y: 7,  scale: 1.0 }, // top-left of right overlay panel
  "split-dark-editorial": { x: 5,  y: 8,  scale: 1.0 }, // top-left of left dark panel
  "bottom-card-overlay":  { x: 78, y: 5,  scale: 1.0 }, // top-right (flips when card moves)
};

export const COVER_LAYOUTS: { key: CoverLayoutKey; label: string }[] = [
  { key: "hero-image",           label: "Photo Left · Panel Right"   }, // original
  { key: "split-editorial",      label: "Full Bleed · Dark Overlay"  }, // original
  { key: "right-panel-overlay",  label: "Panel Overlay"              }, // new
  { key: "split-dark-editorial", label: "Split Dark Editorial"       }, // new
  { key: "bottom-card-overlay",  label: "Bottom Card"                }, // new
];

export const OBJECTIVE_LAYOUTS: { key: ObjectiveLayoutKey; label: string }[] = [
  { key: "statement-left",    label: "Statement Left"    },
  { key: "dark-statement",    label: "Dark Statement"    },
  { key: "executive-summary", label: "Executive Summary" },
  { key: "blueprint-overlay", label: "Blueprint Overlay" },
];

export const INVESTMENT_LAYOUTS: { key: InvestmentLayoutKey; label: string }[] =
  [{ key: "table-callout", label: "Table Callout" }];

export const WHY_US_LAYOUTS: { key: WhyUsLayoutKey; label: string }[] = [
  { key: "pillars-grid",       label: "Pillars Grid"        },
  { key: "editorial-cards",    label: "Editorial Cards"     },
  { key: "stacked-list",       label: "Stacked List"        },
  { key: "testimonials-split", label: "Testimonials Split"  },
];

export const SCOPE_OVERVIEW_LAYOUTS: { key: ScopeOverviewLayoutKey; label: string }[] = [
  { key: "split-panel", label: "Split Panel" },
  { key: "image-row",   label: "Image Row"   },
];

export const BEFORE_AFTER_LAYOUTS: { key: BeforeAfterLayoutKey; label: string }[] = [
  { key: "side-by-side",   label: "Side by Side"   },
  { key: "after-emphasis", label: "After Emphasis"  },
];

export const SCOPE_BREAKDOWN_LAYOUTS: { key: ScopeBreakdownLayoutKey; label: string }[] = [
  { key: "text-grid", label: "Text Grid" },
];

export const RISK_BRIEF_LAYOUTS: { key: RiskBriefLayoutKey; label: string }[] = [
  { key: "two-column",       label: "Two Column"        },
  { key: "comparison-table", label: "Comparison Matrix" },
];

export const PROCESS_LAYOUTS: { key: ProcessLayoutKey; label: string }[] = [
  { key: "three-stages", label: "Three Stages" },
];

export function getLayoutsForType(type: SlideType) {
  switch (type) {
    case "cover":
      return COVER_LAYOUTS;
    case "objective":
      return OBJECTIVE_LAYOUTS;
    case "investment":
      return INVESTMENT_LAYOUTS;
    case "why-us":
      return WHY_US_LAYOUTS;
    case "scope-overview":
      return SCOPE_OVERVIEW_LAYOUTS;
    case "before-after":
      return BEFORE_AFTER_LAYOUTS;
    case "scope-breakdown":
      return SCOPE_BREAKDOWN_LAYOUTS;
    case "risk-brief":
      return RISK_BRIEF_LAYOUTS;
    case "process":
      return PROCESS_LAYOUTS;
  }
}

export const SLIDE_TYPE_LABELS: Record<SlideType, string> = {
  cover:             "Cover",
  objective:         "Objective",
  investment:        "Investment",
  "why-us":          "Why Us",
  "scope-overview":  "Scope Overview",
  "before-after":    "Before / After",
  "scope-breakdown": "Scope Breakdown",
  "risk-brief":      "Risk Brief",
  "process":         "Our Process",
};
