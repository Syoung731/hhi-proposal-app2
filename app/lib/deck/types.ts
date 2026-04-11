// ─────────────────────────────────────────────────────────────────────────────
// Deck Data Model
// Phase 1: cover | objective | investment
// ─────────────────────────────────────────────────────────────────────────────

export type SlideType = "cover" | "objective" | "investment" | "why-us" | "scope-overview" | "before-after" | "scope-breakdown" | "risk-brief" | "process" | "core-values" | "project-timeline" | "cope-page" | "design-retainer" | "next-steps" | "closing-slide" | "visual-inspiration" | "client-testimonials" | "design-build-advantage" | "addition-overview";

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
  | "bottom-card-overlay"
  | "cad-overlay";
export type ObjectiveLayoutKey =
  | "light-statement"
  | "dark-statement"
  // Deprecated — migrated to light-statement at render time
  | "statement-left"
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
export type CoreValuesLayoutKey = "quad-grid" | "cards-row" | "labeled-list" | "icon-cards";
export type ProjectTimelineLayoutKey = "vertical-dot" | "vertical-alternating" | "stepped-hierarchy";
export type CopePageLayoutKey = "icon-columns" | "quad-photos" | "annotated-diagram";
export type DesignRetainerLayoutKey = "centered-hero" | "framed-card" | "dark-overlay-modal";
export type NextStepsLayoutKey = "numbered-photo" | "column-grid-photos" | "two-by-two-grid" | "large-number-hero";
export type ClosingSlideLayoutKey = "dark-centered" | "light-logo-centered" | "photo-white-card";
export type VisualInspirationLayoutKey = "hero-plus-stacked" | "masonry-grid" | "side-by-side-bleed";
export type ClientTestimonialsLayoutKey = "quote-cards" | "single-feature" | "photo-overlay";
export type DesignBuildAdvantageLayoutKey = "icon-cards" | "bold-guarantee" | "quad-grid" | "cycle-diagram";
export type AdditionOverviewLayoutKey = "photo-cad-overlay" | "photo-bullet-card" | "combined";
export type SlideLayoutKey =
  | CoverLayoutKey
  | ObjectiveLayoutKey
  | InvestmentLayoutKey
  | WhyUsLayoutKey
  | ScopeOverviewLayoutKey
  | BeforeAfterLayoutKey
  | ScopeBreakdownLayoutKey
  | RiskBriefLayoutKey
  | ProcessLayoutKey
  | CoreValuesLayoutKey
  | ProjectTimelineLayoutKey
  | CopePageLayoutKey
  | DesignRetainerLayoutKey
  | NextStepsLayoutKey
  | ClosingSlideLayoutKey
  | VisualInspirationLayoutKey
  | ClientTestimonialsLayoutKey
  | DesignBuildAdvantageLayoutKey
  | AdditionOverviewLayoutKey;

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

// ─── Shared Slide Content Fields ────────────────────────────────────────────
// These fields are available on every slide content interface.
// Logo, section label, and accent color controls added in Phase 2.

export interface SharedSlideFields {
  // ── Logo controls (Phase 3 — slider-based) ────────────────────────────────
  /** Show logo overlay. Default: true for Cover/BeforeAfter/Closing, false for others. */
  showLogo?: boolean | null;
  /** Logo variant: 'light' = dark logo on light bg, 'dark' = light logo on dark bg. */
  logoVariant?: "light" | "dark" | null;
  /** Logo scale multiplier 0.5–4.0. Default: 1.0. */
  logoSize?: number | null;
  /** Logo horizontal position 0–100 (% from left). */
  logoX?: number | null;
  /** Logo vertical position 0–100 (% from top). */
  logoY?: number | null;

  // ── Section label ─────────────────────────────────────────────────────────
  /** Show section label above headline. Default: true where applicable. */
  showSectionLabel?: boolean | null;

  // ── Accent color ──────────────────────────────────────────────────────────
  /** Per-slide accent color override (hex). Default: '#B8860B' (gold). */
  accentColor?: string | null;

  // ── Typography (Phase 3) ──────────────────────────────────────────────────
  /** Headline font family. Default: SLIDE_FONTS.defaults.headline */
  headlineFont?: string | null;
  /** Body font family. Default: SLIDE_FONTS.defaults.body */
  bodyFont?: string | null;
  /** Headline size scale preset. Default: 'medium' (1.0x). */
  headlineSizeScale?: "small" | "medium" | "large" | "display" | null;
  /** Headline text color (hex). Default: #1B2A4A. */
  headlineColor?: string | null;
  /** Body text size scale preset. Default: 'medium' (1.0x). */
  bodySizeScale?: "small" | "medium" | "large" | null;
  /** Body text color (hex). Default: #4A5568. */
  bodyColor?: string | null;

  // ── Photo overlay ─────────────────────────────────────────────────────────
  /** Whether to show the photo overlay. Default: true for layouts that support it. */
  showOverlay?: boolean | null;
  /** Overlay opacity 0–1 for photo backgrounds. Default: 0.55. */
  overlayOpacity?: number | null;

  // ── Card styling ──────────────────────────────────────────────────────────
  /** Card border style. Default: 'none'. */
  cardBorderStyle?: "none" | "subtle" | "accent" | null;
  /** Card shadow preset. Default: 'normal'. */
  cardShadow?: "none" | "subtle" | "normal" | "elevated" | null;
  /** Card spacing density. Default: 'normal'. */
  cardSpacing?: "compact" | "normal" | "spacious" | null;

  // ── Text layout ───────────────────────────────────────────────────────────
  /** Text alignment for editorial slides. Default: 'left'. */
  textAlignment?: "left" | "center" | null;
  /** Line spacing for editorial slides. Default: 'normal'. */
  lineSpacing?: "tight" | "normal" | "relaxed" | null;

  // ── CTA controls ──────────────────────────────────────────────────────────
  /** Show contact info block. Default: true. */
  showContactInfo?: boolean | null;
  /** Show footer note block. Default: true. */
  showFooterNote?: boolean | null;

  // ── Deprecated Phase 2 fields (kept for backward compat) ──────────────────
  /** @deprecated Use logoX/logoY instead. */
  logoPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "centered" | "custom" | null;
  /** @deprecated Use logoSize (number) instead. */
  logoSizePreset?: "sm" | "md" | "lg" | null;
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

export interface CoverContent extends SharedSlideFields {
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

  // Per-field text controls
  headlineSize?: number;          // default: 2.0 (em) — the big serif heading
  headlineBold?: boolean;         // default: true
  headlineItalic?: boolean;       // default: false
  headlineUnderline?: boolean;    // default: false

  subheadlineSize?: number;       // default: 1.0 (em) — the small project name label
  subheadlineBold?: boolean;      // default: false
  subheadlineItalic?: boolean;    // default: false
  subheadlineUnderline?: boolean; // default: false

  preparedForSize?: number;       // default: 0.9 (em)
  preparedForBold?: boolean;      // default: false
  preparedForItalic?: boolean;    // default: false
  preparedForUnderline?: boolean; // default: false

  // Per-field font families (override the global headlineFont / bodyFont)
  /** Font for the small project name / address label. */
  projectNameFont?: string | null;
  /** Font for the "Prepared for" line. */
  preparedForFont?: string | null;

  /** Editable address shown on panel layouts. Defaults to branding.address. */
  address?: string | null;

  // ── CAD Overlay layout fields ─────────────────────────────────────────────
  /** Media library photo ID for CAD overlay source. */
  cadSourcePhotoId?: string | null;
  /** URL of the selected source photo. */
  cadSourcePhotoUrl?: string | null;
  /** URL of the AI-generated CAD composite image. */
  cadGeneratedImageUrl?: string | null;
  /** Generation status. */
  cadGenerationStatus?: "idle" | "generating" | "complete" | "error" | null;
  /** Error message if generation failed. */
  cadGenerationError?: string | null;
  /** How strong the CAD line effect is (0-1). Default: 0.7. */
  cadOverlayIntensity?: number | null;
  /** Where the photo-to-CAD fade starts (0-100, % from left). Default: 45. */
  cadTransitionPosition?: number | null;
  /** Which side the CAD/blueprint effect appears on. Default: "right". */
  cadSide?: "left" | "right" | null;

  // ── CAD Overlay tagline per-field controls ────────────────────────────────
  taglineSize?: number | null;
  taglineBold?: boolean | null;
  taglineItalic?: boolean | null;
  taglineUnderline?: boolean | null;
  taglineFont?: string | null;
}

export interface ObjectiveContent extends SharedSlideFields {
  statementText?: string | null;
  supportingText?: string | null;
  bullets?: string[];

  // ── Per-field text styling ────────────────────────────────────────────────
  // Headline
  headlineSize?: number | null;
  headlineColor?: string | null;
  headlineOutline?: string | null;
  headlineBold?: boolean | null;
  headlineItalic?: boolean | null;
  headlineUnderline?: boolean | null;

  // Statement
  statementFont?: string | null;
  statementSize?: number | null;
  statementColor?: string | null;
  statementOutline?: string | null;
  statementBold?: boolean | null;      // default: true
  statementItalic?: boolean | null;
  statementUnderline?: boolean | null;

  // Supporting text
  supportingTextFont?: string | null;
  supportingSize?: number | null;
  supportingColor?: string | null;
  supportingBold?: boolean | null;
  supportingItalic?: boolean | null;
  supportingUnderline?: boolean | null;
  supportingOutline?: string | null;

  // Bullets
  bulletsFont?: string | null;
  bulletsSize?: number | null;
  bulletColor?: string | null;
  bulletsBold?: boolean | null;
  bulletsItalic?: boolean | null;
  bulletsUnderline?: boolean | null;
  bulletsOutline?: string | null;
  bulletIconColor?: string | null;

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
  /** Bucket category: "BASE" | "ALTERNATE" | "ALLOWANCE" */
  bucket?: string | null;
  /** Source range from the cost estimator (low end). */
  rangeLow?: number | null;
  rangeTarget?: number | null;
  /** Source range from the cost estimator (high end). */
  rangeHigh?: number | null;
  /** Proposal-specific override values — used when isOverride=true. */
  overrideLow?: number | null;
  overrideTarget?: number | null;
  overrideHigh?: number | null;
  /**
   * When true, display overrideLow/overrideHigh instead of rangeLow/rangeHigh.
   * Allows the proposal to show rounded/negotiated figures without editing the source.
   */
  isOverride?: boolean;
  includeInTotals?: boolean;
  sortOrder?: number;
  /** @deprecated Not rendered — kept for backward compatibility. */
  isCope?: boolean;
}

export interface InvestmentContent extends SharedSlideFields {
  lineItems?: InvestmentLineItem[];
  retainerLabel?: string | null;
  retainerAmount?: number | null;
  /** Short description shown below the retainer label in the callout box. */
  retainerDescription?: string | null;
  /** @deprecated Use retainerDescription instead. */
  disclaimer?: string | null;
  address?: string | null;
  /** Table header background color (hex). Default: #1B2A4A. */
  tableHeaderBgColor?: string | null;
  /** Show retainer section at bottom. Default: true. */
  showRetainerSection?: boolean | null;
  /** Line item density. Default: 'normal'. */
  lineItemSizePreset?: "compact" | "normal" | "spacious" | null;
  /** Retainer box accent color (hex). Default: #B8860B. */
  retainerAccentColor?: string | null;

  // ── Per-field: Headline ──────────────────────────────────────────────────
  headlineSize?: number | null;
  headlineBold?: boolean | null;
  headlineItalic?: boolean | null;
  headlineUnderline?: boolean | null;
  headlineOutline?: string | null;

  // ── Per-field: Retainer Label ────────────────────────────────────────────
  retainerLabelFont?: string | null;
  retainerLabelSize?: number | null;
  retainerLabelBold?: boolean | null;
  retainerLabelItalic?: boolean | null;
  retainerLabelUnderline?: boolean | null;
  retainerLabelColor?: string | null;
  retainerLabelOutline?: string | null;

  // ── Per-field: Retainer Amount ───────────────────────────────────────────
  retainerAmountFont?: string | null;
  /** Retainer amount font-size multiplier. Default: 2.5. */
  retainerAmountSize?: number | null;
  /** Default: true (large display number). */
  retainerAmountBold?: boolean | null;
  retainerAmountItalic?: boolean | null;
  retainerAmountUnderline?: boolean | null;
  retainerAmountColor?: string | null;
  retainerAmountOutline?: string | null;

  // ── Per-field: Retainer Description ──────────────────────────────────────
  retainerDescFont?: string | null;
  retainerDescSize?: number | null;
  retainerDescBold?: boolean | null;
  retainerDescItalic?: boolean | null;
  retainerDescUnderline?: boolean | null;
  retainerDescColor?: string | null;
  retainerDescOutline?: string | null;

  // ── Per-field: Table Header ──────────────────────────────────────────────
  tableHeaderFont?: string | null;
  tableHeaderSize?: number | null;
  tableHeaderBold?: boolean | null;
  tableHeaderItalic?: boolean | null;
  tableHeaderUnderline?: boolean | null;
  tableHeaderOutline?: string | null;
}

/** A single client testimonial for use in the testimonials-split layout. */
export interface WhyUsTestimonial {
  id: string;
  quote: string;
  author: string;
  location?: string | null;
  rating?: number | null;
}

/** A single value pillar resolved from the DB for use in a slide. */
export interface WhyUsPillarItem {
  id: string;
  title: string;
  body: string;
  /** Public URL of the BrandIcon PNG. Null if no icon was assigned. */
  iconUrl: string | null;

  // ── Per-item: title style ─────────────────────────────────────────────────
  titleFont?: string;
  /** Title font-size multiplier. Default: 1.1. */
  titleSize?: number;
  /** Default: true. */
  titleBold?: boolean;
  titleItalic?: boolean;
  titleUnderline?: boolean;
  titleColor?: string;
  titleOutline?: string | null;

  // ── Per-item: description style ───────────────────────────────────────────
  descriptionFont?: string;
  /** Description font-size multiplier. Default: 0.9. */
  descriptionSize?: number;
  descriptionBold?: boolean;
  descriptionItalic?: boolean;
  descriptionUnderline?: boolean;
  descriptionColor?: string;
  descriptionOutline?: string | null;
}

/**
 * Content shape for why-us slides.
 * Pillars are baked in at deck-load time from the ValuePillar table so the
 * slide renderer is fully self-contained — no extra props required.
 */
export interface WhyUsContent extends SharedSlideFields {
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
   * When absent or empty the layout renders clean empty cards.
   */
  testimonials?: WhyUsTestimonial[];
  /**
   * Optional curated testimonial IDs for the testimonials-split layout.
   * When empty/absent the inspector auto-selects the first 3 approved
   * testimonials from the library.
   */
  testimonialIds?: string[];

  // ── Per-field: Section title ──────────────────────────────────────────────
  sectionTitleFont?: string | null;
  sectionTitleSize?: number | null;
  /** Default: true (headline field). */
  sectionTitleBold?: boolean | null;
  sectionTitleItalic?: boolean | null;
  sectionTitleUnderline?: boolean | null;
  sectionTitleColor?: string | null;
  sectionTitleOutline?: string | null;
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
  /** Zoom level 50–200 (percentage). Default 100 = fit container. Below 100 zooms out, above zooms in. */
  scale?: number;
  /** Horizontal pan 0–100 (percentage). Default 50 = centered. */
  positionX?: number;
  /** Vertical pan 0–100 (percentage). Default 50 = centered. */
  positionY?: number;
}

/**
 * Content shape for scope-overview slides.
 * title maps to slide.headline.
 * Images are selected via the Photo Library picker and stored as
 * ScopeOverviewSelectedPhoto[] so the renderer is fully self-contained.
 */
export interface ScopeOverviewContent extends SharedSlideFields {
  /** 3–4 sentence description of the project scope. */
  description?: string | null;
  /**
   * Photos chosen via the Library Media Picker.
   * split-panel renders the first 2; image-row renders up to 4.
   */
  selectedPhotos?: ScopeOverviewSelectedPhoto[];

  /** Split Panel only: photo panel width as percentage 20–80. Default 50 (equal split). */
  panelSplitRatio?: number | null;

  // ── Per-field: Title ─────────────────────────────────────────────────────
  titleFont?: string | null;
  /** Title font-size multiplier (0.5–4.0). Default 2.0. */
  titleSize?: number | null;
  titleBold?: boolean | null;
  titleItalic?: boolean | null;
  titleUnderline?: boolean | null;
  /** Title text color (hex). */
  titleColor?: string | null;
  titleOutline?: string | null;

  // ── Per-field: Description ───────────────────────────────────────────────
  descriptionFont?: string | null;
  descriptionSize?: number | null;
  descriptionBold?: boolean | null;
  descriptionItalic?: boolean | null;
  descriptionUnderline?: boolean | null;
  descriptionColor?: string | null;
  descriptionOutline?: string | null;

  // ── Text position ────────────────────────────────────────────────────────
  /** Title horizontal position on slide (0–1). */
  titleX?: number | null;
  /** Title vertical position on slide (0–1). */
  titleY?: number | null;
  /** Copy horizontal position on slide (0–1). */
  copyX?: number | null;
  /** Copy vertical position on slide (0–1). */
  copyY?: number | null;

  // ── Deprecated (migrated to per-field) ───────────────────────────────────
  /** @deprecated Use descriptionSize instead. */
  copySize?: number | null;
  /** @deprecated Use descriptionColor instead. */
  copyColor?: string | null;
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

  // ── Per-item: title style ────────────────────────────────────────────────
  titleFont?: string;
  titleSize?: number;
  titleBold?: boolean;         // default: true
  titleItalic?: boolean;
  titleUnderline?: boolean;
  titleColor?: string;
  titleOutline?: string;

  // ── Per-item: description style ──────────────────────────────────────────
  descriptionFont?: string;
  descriptionSize?: number;
  descriptionBold?: boolean;
  descriptionItalic?: boolean;
  descriptionUnderline?: boolean;
  descriptionColor?: string;
  descriptionOutline?: string;
}

/**
 * Content shape for scope-breakdown slides.
 * Represents project areas that do NOT have a selected proposal render.
 * Photos are optional supporting images from the Library (not room-specific).
 */
export interface ScopeBreakdownContent extends SharedSlideFields {
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

  // ── Per-field: Title ─────────────────────────────────────────────────────
  titleFont?: string | null;
  titleSize?: number | null;
  titleBold?: boolean | null;
  titleItalic?: boolean | null;
  titleUnderline?: boolean | null;
  titleColor?: string | null;
  titleOutline?: string | null;

  // ── Per-field: Intro text ────────────────────────────────────────────────
  introFont?: string | null;
  introSize?: number | null;
  introBold?: boolean | null;
  introItalic?: boolean | null;
  introUnderline?: boolean | null;
  introColor?: string | null;
  introOutline?: string | null;
}

/**
 * Content shape for risk-brief slides.
 * Two-column problem/solution layout with a bottom statement.
 */
export interface RiskBriefContent extends SharedSlideFields {
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
  /** Left column/panel box background color (hex). Applied when a brand background is set. */
  leftBoxColor?: string | null;
  /** Right column/panel box background color (hex). Applied when a brand background is set. */
  rightBoxColor?: string | null;
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

  // ── Per-field: Slide title ──────────────────────────────────────────────
  titleFont?: string | null;
  titleSize?: number | null;
  titleBold?: boolean | null;
  titleItalic?: boolean | null;
  titleUnderline?: boolean | null;
  titleColor?: string | null;
  titleTextOutline?: string | null;

  // ── Per-field: Column headers ───────────────────────────────────────────
  headerFont?: string | null;
  headerSize?: number | null;
  headerBold?: boolean | null;
  headerItalic?: boolean | null;
  headerUnderline?: boolean | null;
  headerTextColor?: string | null;
  headerTextOutline?: string | null;

  // ── Per-field: Body / bullets ───────────────────────────────────────────
  bodySize?: number | null;
  bodyBold?: boolean | null;
  bodyItalic?: boolean | null;
  bodyUnderline?: boolean | null;
  bodyTextColor?: string | null;
  bodyTextOutline?: string | null;

  // ── Per-field: Bottom statement ─────────────────────────────────────────
  bottomFont?: string | null;
  bottomSize?: number | null;
  bottomBold?: boolean | null;
  bottomItalic?: boolean | null;
  bottomUnderline?: boolean | null;
  bottomColor?: string | null;
  bottomTextOutline?: string | null;
}

/** A single stage in a process slide. */
export interface ProcessStage {
  name: string;
  bullets: string[];

  // ── Per-item: stage name style ───────────────────────────────────────────
  nameFont?: string;
  nameSize?: number;
  nameBold?: boolean;          // default: true
  nameItalic?: boolean;
  nameUnderline?: boolean;
  nameColor?: string;
  nameOutline?: string;

  // ── Per-item: bullets style (shared across all bullets in this stage) ───
  bulletsFont?: string;
  bulletsSize?: number;
  bulletsBold?: boolean;
  bulletsItalic?: boolean;
  bulletsUnderline?: boolean;
  bulletsColor?: string;
  bulletsOutline?: string;
}

/**
 * Content shape for process slides.
 * Three sequential stages presented left-to-right.
 */
export interface ProcessContent extends SharedSlideFields {
  /** The three stages of the process. */
  stages?: ProcessStage[];
  /** Full-width closing statement at the bottom. */
  bottomStatement?: string | null;
  /** When true, all stages inherit style fields from stage[0]. */
  lockItemStyles?: boolean | null;

  // ── Per-field: Slide title ───────────────────────────────────────────────
  slideTitleFont?: string | null;
  slideTitleSize?: number | null;
  slideTitleBold?: boolean | null;
  slideTitleItalic?: boolean | null;
  slideTitleUnderline?: boolean | null;
  slideTitleColor?: string | null;
  slideTitleOutline?: string | null;

  // ── Per-field: Footer CTA ────────────────────────────────────────────────
  footerFont?: string | null;
  footerSize?: number | null;
  footerBold?: boolean | null;
  footerItalic?: boolean | null;
  footerUnderline?: boolean | null;
  footerColor?: string | null;
  footerOutline?: string | null;
}

/** A single core value entry for the core-values slide. */
export interface CoreValue {
  id: string;
  name: string;
  /** Lucide icon name (e.g. "Shield", "Scale", "MessageSquare"). Fallback when no BrandIcon set. */
  icon: string;
  /** BrandIcon.id from the Icon Library. When set, iconUrl is used for rendering. */
  iconId?: string | null;
  /** Resolved BrandIcon.imageUrl. Preferred over inline SVG when available. */
  iconUrl?: string | null;
  descriptor: string;
  description: string;

  // ── Per-item: name style ──────────────────────────────────────────────────
  nameFont?: string;
  nameSize?: number;
  nameBold?: boolean;
  nameItalic?: boolean;
  nameUnderline?: boolean;
  nameColor?: string;
  nameOutline?: string | null;

  // ── Per-item: descriptor style ────────────────────────────────────────────
  descriptorFont?: string;
  descriptorSize?: number;
  descriptorBold?: boolean;
  descriptorItalic?: boolean;
  descriptorUnderline?: boolean;
  descriptorColor?: string;
  descriptorOutline?: string | null;

  // ── Per-item: description style ───────────────────────────────────────────
  descriptionFont?: string;
  descriptionSize?: number;
  descriptionBold?: boolean;
  descriptionItalic?: boolean;
  descriptionUnderline?: boolean;
  descriptionColor?: string;
  descriptionOutline?: string | null;
}

/** Content shape for core-values slides. */
export interface CoreValuesContent extends SharedSlideFields {
  /** Section label above the headline. Default: "WHO WE ARE". */
  sectionLabel?: string | null;
  /** The 5 value cards. Falls back to built-in HHI defaults when absent. */
  values?: CoreValue[];
  /** Background image URL for the quad-grid layout. */
  backgroundImageUrl?: string | null;
  /** When true, all values inherit style fields from value[0]. */
  lockItemStyles?: boolean | null;

  // ── Per-field: Section label ────────────────────────────────────────────
  sectionLabelFont?: string | null;
  sectionLabelColor?: string | null;

  // ── Per-field: Slide title (headline) ───────────────────────────────────
  slideTitleFont?: string | null;
  slideTitleSize?: number | null;
  slideTitleBold?: boolean | null;
  slideTitleItalic?: boolean | null;
  slideTitleUnderline?: boolean | null;
  slideTitleColor?: string | null;
  slideTitleOutline?: string | null;
}

/** A single phase in a project timeline slide. */
export interface ProjectPhase {
  id: string;
  name: string;
  /** Human-readable duration, e.g. "8 – 12 weeks". */
  duration: string;
  description: string;
  /** Sub-note displayed in stepped-hierarchy layout only. */
  note?: string | null;

  // ── Per-item: name style ─────────────────────────────────────────────────
  nameFont?: string;
  nameSize?: number;          // default: 1.2
  nameBold?: boolean;         // default: true
  nameItalic?: boolean;
  nameUnderline?: boolean;
  nameColor?: string;
  nameOutline?: string | null;

  // ── Per-item: duration style ─────────────────────────────────────────────
  durationFont?: string;
  durationSize?: number;      // default: 0.9
  durationBold?: boolean;
  durationItalic?: boolean;
  durationUnderline?: boolean;
  durationColor?: string;
  durationOutline?: string | null;

  // ── Per-item: description style ──────────────────────────────────────────
  descriptionFont?: string;
  descriptionSize?: number;   // default: 0.9
  descriptionBold?: boolean;
  descriptionItalic?: boolean;
  descriptionUnderline?: boolean;
  descriptionColor?: string;
  descriptionOutline?: string | null;

  // ── Per-item: note style (stepped-hierarchy only) ────────────────────────
  noteFont?: string;
  noteSize?: number;          // default: 0.8
  noteBold?: boolean;
  noteItalic?: boolean;
  noteUnderline?: boolean;
  noteColor?: string;
  noteOutline?: string | null;
}

/** Content shape for project-timeline slides. */
export interface ProjectTimelineContent extends SharedSlideFields {
  /** Section label above the headline. Default: "YOUR PROJECT". */
  sectionLabel?: string | null;
  /** Whether to append the project address to the headline. Default: true. */
  showAddress?: boolean | null;
  /** Optional footer note rendered at the bottom of the slide. */
  footnoteText?: string | null;
  /** Accent color override (hex). Default: "#B8860B" (gold). */
  accentColor?: string | null;
  /** Timeline phases. Falls back to built-in 3-phase HHI defaults when absent. */
  phases?: ProjectPhase[];

  // ── Per-field: Section label (font + color only) ─────────────────────────
  sectionLabelFont?: string | null;
  sectionLabelColor?: string | null;

  // ── Per-field: Headline ──────────────────────────────────────────────────
  headlineSize?: number | null;
  headlineBold?: boolean | null;
  headlineItalic?: boolean | null;
  headlineUnderline?: boolean | null;
  headlineOutline?: string | null;

  // ── Per-field: Footnote ──────────────────────────────────────────────────
  footnoteFont?: string | null;
  footnoteSize?: number | null;
  footnoteBold?: boolean | null;
  footnoteItalic?: boolean | null;
  footnoteUnderline?: boolean | null;
  footnoteColor?: string | null;
  footnoteOutline?: string | null;
}

/** A single COPE (Cost of Project Execution) item. */
export interface CopeItem {
  id: string;
  /** Lucide icon name — used in icon-columns layout. Fallback when no BrandIcon set. */
  icon?: string | null;
  /** BrandIcon.id from the Icon Library. */
  iconId?: string | null;
  /** Resolved BrandIcon.imageUrl. Preferred over inline SVG when available. */
  iconUrl?: string | null;
  title: string;
  description: string;
  /** Bullet points — used in icon-columns layout. */
  bullets?: string[];
  /** Image URL — used in quad-photos layout. */
  photo?: string | null;
  /** Short label — used in annotated-diagram layout. */
  calloutLabel?: string | null;

  // ── Per-item: title style ─────────────────────────────────────────────────
  titleFont?: string;
  titleSize?: number;
  titleBold?: boolean;
  titleItalic?: boolean;
  titleUnderline?: boolean;
  titleColor?: string;
  titleOutline?: string | null;

  // ── Per-item: description style ───────────────────────────────────────────
  descriptionFont?: string;
  descriptionSize?: number;
  descriptionBold?: boolean;
  descriptionItalic?: boolean;
  descriptionUnderline?: boolean;
  descriptionColor?: string;
  descriptionOutline?: string | null;

  // ── Per-item: bullets style ───────────────────────────────────────────────
  bulletsFont?: string;
  bulletsSize?: number;
  bulletsBold?: boolean;
  bulletsItalic?: boolean;
  bulletsUnderline?: boolean;
  bulletsColor?: string;
  bulletsOutline?: string | null;
}

/** Content shape for cope-page slides. */
export interface CopePageContent extends SharedSlideFields {
  /** Section label above the headline. Default: "WHAT'S INCLUDED". */
  sectionLabel?: string | null;
  /** Optional supporting line below headline. */
  subheadline?: string | null;
  /** Hero image URL for annotated-diagram layout. */
  heroImageUrl?: string | null;
  /** COPE items. Falls back to built-in HHI defaults when absent. */
  items?: CopeItem[];
  /** When true, all items inherit style fields from item[0]. */
  lockItemStyles?: boolean | null;

  // ── Per-field: Section label ────────────────────────────────────────────
  sectionLabelFont?: string | null;
  sectionLabelColor?: string | null;

  // ── Per-field: Slide title (headline) ───────────────────────────────────
  slideTitleFont?: string | null;
  slideTitleSize?: number | null;
  slideTitleBold?: boolean | null;
  slideTitleItalic?: boolean | null;
  slideTitleUnderline?: boolean | null;
  slideTitleColor?: string | null;
  slideTitleOutline?: string | null;

  // ── Per-field: Subheadline ──────────────────────────────────────────────
  subheadlineFont?: string | null;
  subheadlineSize?: number | null;
  subheadlineBold?: boolean | null;
  subheadlineItalic?: boolean | null;
  subheadlineUnderline?: boolean | null;
  subheadlineColor?: string | null;
  subheadlineOutline?: string | null;
}

/** A single benefit item in a design-retainer slide. */
export interface DesignRetainerBenefit {
  text: string;
  textFont?: string;
  textSize?: number;
  textBold?: boolean;
  textItalic?: boolean;
  textUnderline?: boolean;
  textColor?: string;
  textOutline?: string | null;
}

/** Content shape for design-retainer slides. */
export interface DesignRetainerContent extends SharedSlideFields {
  /** Section label above the headline. Default: "DESIGN RETAINER". */
  sectionLabel?: string | null;
  /** Tagline shown below headline. */
  tagline?: string | null;
  /** The retainer amount string, e.g. "$22,000". */
  retainerAmount?: string | null;
  /** One-line description (used in framed-card layout). */
  description?: string | null;
  /** Fine print / included note. */
  noteText?: string | null;
  /** Background image URL for dark-overlay-modal layout. */
  backgroundImage?: string | null;
  /** Benefit bullet points. Supports legacy string[] and new object[]. */
  benefits?: (string | DesignRetainerBenefit)[];

  // ── Per-field: Section label (font + color only per Section 6) ──────────
  sectionLabelFont?: string | null;
  sectionLabelColor?: string | null;

  // ── Per-field: Headline ──────────────────────────────────────────────────
  headlineFont2?: string | null;
  headlineSize?: number | null;
  headlineBold?: boolean | null;
  headlineItalic?: boolean | null;
  headlineUnderline?: boolean | null;
  headlineColor2?: string | null;
  headlineOutline?: string | null;

  // ── Per-field: Tagline ───────────────────────────────────────────────────
  taglineFont?: string | null;
  taglineSize?: number | null;
  taglineBold?: boolean | null;
  taglineItalic?: boolean | null;
  taglineUnderline?: boolean | null;
  taglineColor?: string | null;
  taglineOutline?: string | null;

  // ── Per-field: Retainer Amount ───────────────────────────────────────────
  amountFont?: string | null;
  /** Default: 3.0 (large display number). */
  amountSize?: number | null;
  /** Default: true. */
  amountBold?: boolean | null;
  amountItalic?: boolean | null;
  amountUnderline?: boolean | null;
  /** Default: resolvedAccent (gold). */
  amountColor?: string | null;
  amountOutline?: string | null;

  // ── Per-field: Description ───────────────────────────────────────────────
  descriptionFont?: string | null;
  descriptionSize?: number | null;
  descriptionBold?: boolean | null;
  descriptionItalic?: boolean | null;
  descriptionUnderline?: boolean | null;
  descriptionColor?: string | null;
  descriptionOutline?: string | null;

  // ── Per-field: Note Text (fine print) ────────────────────────────────────
  noteFont?: string | null;
  /** Default: 0.75 (fine print). */
  noteSize?: number | null;
  noteBold?: boolean | null;
  noteItalic?: boolean | null;
  noteUnderline?: boolean | null;
  noteColor?: string | null;
  noteOutline?: string | null;
}

/** A single step in a next-steps slide. */
export interface NextStep {
  id: string;
  number: number;
  title: string;
  description: string;
  /** Photo URL — used in column-grid-photos layout. */
  photo?: string | null;

  // ── Per-item: number display style ────────────────────────────────────────
  numberFont?: string;
  /** Number font-size multiplier. Default: 3.0 (large display). */
  numberSize?: number;
  /** Default: true. */
  numberBold?: boolean;
  numberItalic?: boolean;
  numberUnderline?: boolean;
  /** Default: resolvedAccent (gold). */
  numberColor?: string;
  numberOutline?: string | null;

  // ── Per-item: title style ─────────────────────────────────────────────────
  titleFont?: string;
  titleSize?: number;
  titleBold?: boolean;
  titleItalic?: boolean;
  titleUnderline?: boolean;
  titleColor?: string;
  titleOutline?: string | null;

  // ── Per-item: description style ───────────────────────────────────────────
  descriptionFont?: string;
  descriptionSize?: number;
  descriptionBold?: boolean;
  descriptionItalic?: boolean;
  descriptionUnderline?: boolean;
  descriptionColor?: string;
  descriptionOutline?: string | null;
}

/** Content shape for next-steps slides. */
export interface NextStepsContent extends SharedSlideFields {
  /** Section label above the headline. Default: "WHAT HAPPENS NEXT". */
  sectionLabel?: string | null;
  /** Contact email shown in footer. */
  contactEmail?: string | null;
  /** Contact phone shown in footer. */
  contactPhone?: string | null;
  /** Whether to show the project address in footer. */
  showAddress?: boolean | null;
  /** Right-side photo URL — used in numbered-photo and large-number-hero layouts. */
  rightPhoto?: string | null;
  /** The next steps. Falls back to built-in HHI defaults when absent. */
  steps?: NextStep[];
  /** When true, all steps inherit style fields from step[0]. */
  lockItemStyles?: boolean | null;

  // ── Per-field: Section label ────────────────────────────────────────────
  sectionLabelFont?: string | null;
  sectionLabelColor?: string | null;

  // ── Per-field: Slide title (headline) ───────────────────────────────────
  slideTitleFont?: string | null;
  slideTitleSize?: number | null;
  slideTitleBold?: boolean | null;
  slideTitleItalic?: boolean | null;
  slideTitleUnderline?: boolean | null;
  slideTitleColor?: string | null;
  slideTitleOutline?: string | null;

  // ── Per-field: Contact info ──────────────────────────────────────────────
  contactFont?: string | null;
  contactSize?: number | null;
  contactBold?: boolean | null;
  contactItalic?: boolean | null;
  contactUnderline?: boolean | null;
  contactColor?: string | null;
  contactOutline?: string | null;

  // ── Per-field: Footer note ───────────────────────────────────────────────
  footerNoteFont?: string | null;
  footerNoteSize?: number | null;
  footerNoteBold?: boolean | null;
  footerNoteItalic?: boolean | null;
  footerNoteUnderline?: boolean | null;
  footerNoteColor?: string | null;
  footerNoteOutline?: string | null;
}

/** Content shape for closing-slide slides. */
export interface ClosingSlideContent extends SharedSlideFields {
  /** Tagline shown below headline. Default: "Design. Build. Remodel." */
  tagline?: string | null;
  /** Optional subheadline shown below tagline. */
  subheadline?: string | null;
  /** Contact email override. Falls back to branding.email. */
  contactEmail?: string | null;
  /** Contact phone override. Falls back to branding.phone. */
  contactPhone?: string | null;
  /** Address override. Falls back to branding.address. */
  address?: string | null;
  /** Validity note at bottom. Default: "This proposal is valid for 30 days." */
  validityNote?: string | null;
  /** Background color for dark-centered layout. Default: "#1B2A4A". */
  backgroundColor?: string | null;
  /** Background photo URL for dark-centered and photo-white-card layouts. */
  backgroundPhoto?: string | null;

  // ── Per-field: Headline ──────────────────────────────────────────────────
  /** Headline font (overrides shared headlineFont). */
  headlineFont2?: string | null;
  headlineSize?: number | null;
  headlineBold2?: boolean | null;
  headlineItalic?: boolean | null;
  headlineUnderline?: boolean | null;
  /** Layout-aware default: white on dark/photo, navy on light. */
  headlineColor2?: string | null;
  headlineOutline?: string | null;

  // ── Per-field: Tagline ───────────────────────────────────────────────────
  taglineFont?: string | null;
  taglineSize?: number | null;
  taglineBold?: boolean | null;
  /** Default: true. */
  taglineItalic?: boolean | null;
  taglineUnderline?: boolean | null;
  /** Default: resolvedAccent (gold). */
  taglineColor?: string | null;
  taglineOutline?: string | null;

  // ── Per-field: Subheadline ───────────────────────────────────────────────
  subheadlineFont?: string | null;
  subheadlineSize?: number | null;
  subheadlineBold?: boolean | null;
  subheadlineItalic?: boolean | null;
  subheadlineUnderline?: boolean | null;
  subheadlineColor?: string | null;
  subheadlineOutline?: string | null;

  // ── Per-field: Contact Info ──────────────────────────────────────────────
  contactFont?: string | null;
  contactSize?: number | null;
  contactBold?: boolean | null;
  contactItalic?: boolean | null;
  contactUnderline?: boolean | null;
  /** Layout-aware default: white/light on dark, navy on light. */
  contactColor?: string | null;
  contactOutline?: string | null;

  // ── Per-field: Validity Note ─────────────────────────────────────────────
  validityFont?: string | null;
  /** Default: 0.75. */
  validitySize?: number | null;
  validityBold?: boolean | null;
  validityItalic?: boolean | null;
  validityUnderline?: boolean | null;
  /** Default: #9CA3AF (muted light) on dark, same on light. */
  validityColor?: string | null;
  validityOutline?: string | null;
}

/** Content shape for visual-inspiration slides. */
export interface VisualInspirationContent extends SharedSlideFields {
  /** Subtitle shown below headline in hero-plus-stacked layout. */
  subtitle?: string | null;
  /** Caption text for masonry-grid and side-by-side-bleed layouts. */
  caption?: string | null;
  /** Hero photo URL for hero-plus-stacked layout. */
  heroPhoto?: string | null;
  /** Photo URLs selected from the photo library. */
  photos?: string[];

  // ── Per-field: Headline ──────────────────────────────────────────────────
  headlineSize?: number | null;
  headlineBold?: boolean | null;
  headlineItalic?: boolean | null;
  headlineUnderline?: boolean | null;
  headlineOutline?: string | null;

  // ── Per-field: Subtitle ──────────────────────────────────────────────────
  subtitleFont?: string | null;
  subtitleSize?: number | null;
  subtitleBold?: boolean | null;
  subtitleItalic?: boolean | null;
  subtitleUnderline?: boolean | null;
  subtitleColor?: string | null;
  subtitleOutline?: string | null;

  // ── Per-field: Caption ───────────────────────────────────────────────────
  captionFont?: string | null;
  captionSize?: number | null;
  captionBold?: boolean | null;
  captionItalic?: boolean | null;
  captionUnderline?: boolean | null;
  captionColor?: string | null;
  captionOutline?: string | null;
}

/** A single testimonial entry snapshotted from the Testimonial Library. */
export interface SlideTestimonial {
  id: string;
  quote: string;
  clientName: string;
  projectName?: string | null;
  rating?: number | null;
  source?: "google" | "manual" | null;

  // ── Per-item: quote style ─────────────────────────────────────────────────
  quoteFont?: string;
  quoteSize?: number;          // default: 1.1
  quoteBold?: boolean;
  quoteItalic?: boolean;       // default: true
  quoteUnderline?: boolean;
  quoteColor?: string;
  quoteOutline?: string | null;

  // ── Per-item: clientName style ────────────────────────────────────────────
  clientNameFont?: string;
  clientNameSize?: number;     // default: 0.9
  clientNameBold?: boolean;    // default: true
  clientNameItalic?: boolean;
  clientNameUnderline?: boolean;
  clientNameColor?: string;
  clientNameOutline?: string | null;

  // ── Per-item: projectName style ───────────────────────────────────────────
  projectNameFont?: string;
  projectNameSize?: number;    // default: 0.8
  projectNameBold?: boolean;
  projectNameItalic?: boolean;
  projectNameUnderline?: boolean;
  projectNameColor?: string;
  projectNameOutline?: string | null;
}

/** Content shape for client-testimonials slides. */
export interface ClientTestimonialsContent extends SharedSlideFields {
  /** Optional subheadline below headline. */
  subheadline?: string | null;
  /** Background photo URL from photo library. */
  backgroundPhoto?: string | null;
  /** Show star rating graphic per testimonial card. Default: true. */
  showStars?: boolean | null;
  /** Testimonials selected from the library (1-4). */
  testimonials?: SlideTestimonial[];
  /** When true, all testimonials inherit style fields from item[0]. */
  lockItemStyles?: boolean | null;

  // ── Per-field: Headline ──────────────────────────────────────────────────
  headlineSize?: number | null;
  headlineBold?: boolean | null;
  headlineItalic?: boolean | null;
  headlineUnderline?: boolean | null;
  headlineOutline?: string | null;

  // ── Per-field: Subheadline ───────────────────────────────────────────────
  subheadlineFont?: string | null;
  subheadlineSize?: number | null;
  subheadlineBold?: boolean | null;
  subheadlineItalic?: boolean | null;
  subheadlineUnderline?: boolean | null;
  subheadlineColor?: string | null;
  subheadlineOutline?: string | null;
}

/** A pillar/advantage item with a Lucide icon. */
export interface DesignBuildPillar {
  id: string;
  /** Lucide icon name (e.g. "Shield", "PenTool", "Ruler"). Fallback when no BrandIcon set. */
  icon: string;
  /** BrandIcon.id from the Icon Library. */
  iconId?: string | null;
  /** Resolved BrandIcon.imageUrl. Preferred over inline SVG when available. */
  iconUrl?: string | null;
  title: string;
  description: string;

  // ── Per-item: title style ─────────────────────────────────────────────────
  titleFont?: string;
  titleSize?: number;
  titleBold?: boolean;
  titleItalic?: boolean;
  titleUnderline?: boolean;
  titleColor?: string;
  titleOutline?: string | null;

  // ── Per-item: description style ───────────────────────────────────────────
  descriptionFont?: string;
  descriptionSize?: number;
  descriptionBold?: boolean;
  descriptionItalic?: boolean;
  descriptionUnderline?: boolean;
  descriptionColor?: string;
  descriptionOutline?: string | null;
}

/** A bold guarantee statement. */
export interface DesignBuildGuarantee {
  id: string;
  title: string;
  description: string;

  // ── Per-item: title style ─────────────────────────────────────────────────
  titleFont?: string;
  titleSize?: number;
  titleBold?: boolean;
  titleItalic?: boolean;
  titleUnderline?: boolean;
  titleColor?: string;
  titleOutline?: string | null;

  // ── Per-item: description style ───────────────────────────────────────────
  descriptionFont?: string;
  descriptionSize?: number;
  descriptionBold?: boolean;
  descriptionItalic?: boolean;
  descriptionUnderline?: boolean;
  descriptionColor?: string;
  descriptionOutline?: string | null;
}

/** A node in the cycle diagram. */
export interface DesignBuildDiagramNode {
  id: string;
  label: string;
}

/** A supporting column below the cycle diagram. */
export interface DesignBuildSupportColumn {
  id: string;
  title: string;
  description: string;

  // ── Per-item: title style ─────────────────────────────────────────────────
  titleFont?: string;
  titleSize?: number;
  titleBold?: boolean;
  titleItalic?: boolean;
  titleUnderline?: boolean;
  titleColor?: string;
  titleOutline?: string | null;

  // ── Per-item: description style ───────────────────────────────────────────
  descriptionFont?: string;
  descriptionSize?: number;
  descriptionBold?: boolean;
  descriptionItalic?: boolean;
  descriptionUnderline?: boolean;
  descriptionColor?: string;
  descriptionOutline?: string | null;
}

/** Content shape for design-build-advantage slides. */
export interface DesignBuildAdvantageContent extends SharedSlideFields {
  /** Optional subheadline below headline. */
  subheadline?: string | null;
  /** Background style for bold-guarantee layout. Default: "dark". */
  backgroundStyle?: "light" | "dark" | null;
  /** Background photo URL from photo library. */
  backgroundPhoto?: string | null;
  /** Footer note for bold-guarantee layout. */
  footerNote?: string | null;
  /** Pillar items for icon-cards and quad-grid layouts. */
  pillars?: DesignBuildPillar[];
  /** Guarantee items for bold-guarantee layout. */
  guarantees?: DesignBuildGuarantee[];
  /** Cycle diagram node labels for cycle-diagram layout. */
  diagramNodes?: DesignBuildDiagramNode[];
  /** Support columns for cycle-diagram layout. */
  supportColumns?: DesignBuildSupportColumn[];
  /** When true, all items (pillars/guarantees/supportColumns) inherit style fields from item[0]. */
  lockItemStyles?: boolean | null;

  // ── Per-field: Section label ────────────────────────────────────────────
  sectionLabelFont?: string | null;
  sectionLabelColor?: string | null;

  // ── Per-field: Slide title (headline) ───────────────────────────────────
  slideTitleFont?: string | null;
  slideTitleSize?: number | null;
  slideTitleBold?: boolean | null;
  slideTitleItalic?: boolean | null;
  slideTitleUnderline?: boolean | null;
  slideTitleColor?: string | null;
  slideTitleOutline?: string | null;

  // ── Per-field: Subheadline ──────────────────────────────────────────────
  subheadlineFont?: string | null;
  subheadlineSize?: number | null;
  subheadlineBold?: boolean | null;
  subheadlineItalic?: boolean | null;
  subheadlineUnderline?: boolean | null;
  subheadlineColor?: string | null;
  subheadlineOutline?: string | null;

  // ── Per-field: Footer note ──────────────────────────────────────────────
  footerNoteFont?: string | null;
  footerNoteSize?: number | null;
  footerNoteBold?: boolean | null;
  footerNoteItalic?: boolean | null;
  footerNoteUnderline?: boolean | null;
  footerNoteColor?: string | null;
  footerNoteOutline?: string | null;
}

/**
 * Content shape for before-after slides.
 * IDs reference project Media records; URLs are snapshotted at selection time
 * so the renderer is fully self-contained.
 */
export interface BeforeAfterContent extends SharedSlideFields {
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
  /** @deprecated Use headlineSize instead. */
  headingFontSize?: number | null;
  /** @deprecated Use captionSize instead. */
  captionFontSize?: number | null;
  /** @deprecated Use headlineColor instead (consolidated into per-field). */
  headingColor?: string | null;
  /** @deprecated Use captionColor instead (consolidated into per-field). */
  captionColor?: string | null;
  /** Logo size in em units (0.5–8.0). Default 4.0. */
  logoSize?: number | null;
  /** Logo horizontal position, 0 = left edge … 1 = right edge. Default 0.85. */
  logoX?: number | null;
  /** Logo vertical position, 0 = top edge … 1 = bottom edge. Default 0.88. */
  logoY?: number | null;
  /** Which logo variant to display. Default "light". */
  logoVariant?: "light" | "dark" | null;

  // ── Per-field: Headline ──────────────────────────────────────────────────
  headlineSize?: number | null;
  headlineBold?: boolean | null;
  headlineItalic?: boolean | null;
  headlineUnderline?: boolean | null;
  headlineOutline?: string | null;

  // ── Per-field: Caption ───────────────────────────────────────────────────
  captionFont?: string | null;
  captionSize?: number | null;
  captionBold?: boolean | null;
  captionItalic?: boolean | null;
  captionUnderline?: boolean | null;
  captionOutline?: string | null;

  // ── Per-field: Before label ──────────────────────────────────────────────
  beforeLabel?: string | null;
  beforeLabelFont?: string | null;
  beforeLabelSize?: number | null;
  beforeLabelBold?: boolean | null;
  beforeLabelItalic?: boolean | null;
  beforeLabelUnderline?: boolean | null;
  beforeLabelColor?: string | null;
  beforeLabelOutline?: string | null;

  // ── Per-field: After label ───────────────────────────────────────────────
  afterLabel?: string | null;
  afterLabelFont?: string | null;
  afterLabelSize?: number | null;
  afterLabelBold?: boolean | null;
  afterLabelItalic?: boolean | null;
  afterLabelUnderline?: boolean | null;
  afterLabelColor?: string | null;
  afterLabelOutline?: string | null;

  // ── Layout: After Emphasis panel split ────────────────────────────────
  /** Left panel width as a percentage (20–60). Default: 35. Only used in after-emphasis layout. */
  leftPanelWidth?: number | null;
  /** Before photo thumbnail scale as a percentage (30–100). Default: 100. Only used in after-emphasis layout. */
  beforePhotoScale?: number | null;
}

// ─── Addition Overview ──────────────────────────────────────────────────────

export interface AdditionBullet {
  id: string;
  label: string;
  description: string;
  // Per-field: label
  labelFont?: string | null;
  labelSize?: number | null;
  labelBold?: boolean | null;
  labelItalic?: boolean | null;
  labelUnderline?: boolean | null;
  labelColor?: string | null;
  labelOutline?: string | null;
  // Per-field: description
  descriptionFont?: string | null;
  descriptionSize?: number | null;
  descriptionBold?: boolean | null;
  descriptionItalic?: boolean | null;
  descriptionUnderline?: boolean | null;
  descriptionColor?: string | null;
  descriptionOutline?: string | null;
}

export interface AdditionOverviewContent extends SharedSlideFields {
  layout?: AdditionOverviewLayoutKey | null;

  // ── Per-field: Headline ────────────────────────────────────────────────
  headlineSize?: number | null;
  headlineBold?: boolean | null;
  headlineItalic?: boolean | null;
  headlineUnderline?: boolean | null;
  headlineOutline?: string | null;

  // ── Photo ──────────────────────────────────────────────────────────────
  sourcePhotoId?: string | null;
  sourcePhotoUrl?: string | null;

  // ── CAD Overlay (Layouts A and C) ──────────────────────────────────────
  cadGeneratedImageUrl?: string | null;
  cadGenerationStatus?: "idle" | "generating" | "complete" | "error" | null;
  cadGenerationError?: string | null;
  cadOverlayIntensity?: number | null;
  /** Hide the dashed bounding box border while keeping the clipped CAD overlay. */
  showBoundingBox?: boolean | null;
  /** Horizontal offset of the rendered CAD image within the clip region (%, default 0). */
  cadOffsetX?: number | null;
  /** Vertical offset of the rendered CAD image within the clip region (%, default 0). */
  cadOffsetY?: number | null;
  // Bounding box (% of photo dimensions)
  boundingBoxX?: number | null;
  boundingBoxY?: number | null;
  boundingBoxWidth?: number | null;
  boundingBoxHeight?: number | null;
  calloutLabel?: string | null;
  calloutLabelFont?: string | null;
  calloutLabelSize?: number | null;
  calloutLabelBold?: boolean | null;
  calloutLabelItalic?: boolean | null;
  calloutLabelUnderline?: boolean | null;
  calloutLabelColor?: string | null;
  calloutLabelOutline?: string | null;

  // ── Photo panel split (Layout C) ───────────────────────────────────────
  photoPanelWidth?: number | null;

  // ── Bullet card (Layouts B and C) ──────────────────────────────────────
  cardAccentColor?: string | null;
  bullets?: AdditionBullet[] | null;
  cardBackgroundColor?: string | null;
  lockItemStyles?: boolean | null;
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
  | ProcessContent
  | CoreValuesContent
  | ProjectTimelineContent
  | CopePageContent
  | DesignRetainerContent
  | NextStepsContent
  | ClosingSlideContent
  | VisualInspirationContent
  | ClientTestimonialsContent
  | DesignBuildAdvantageContent
  | AdditionOverviewContent;

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
  /**
   * AI-generated background image URL stored in R2.
   * Rendered as the absolute bottom layer (CSS background-image on the slide
   * container) — below backgroundId/textZone system and slide content.
   *
   * Set only via the "✦ Regenerate with AI" flow in the inspector after the
   * user accepts the preview. Never set by the auto-sync engine or updateSlide,
   * so it intentionally does NOT affect isUserModified.
   */
  aiBackground?: string | null;
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
  "cad-overlay":          { x: 3,  y: 4,  scale: 1.0 }, // top-left on photo background
};

export const COVER_LAYOUTS: { key: CoverLayoutKey; label: string }[] = [
  { key: "split-editorial",      label: "Full Bleed · Dark Overlay"  },
  { key: "right-panel-overlay",  label: "Panel Overlay"              },
  { key: "split-dark-editorial", label: "Split Dark Editorial"       },
  { key: "bottom-card-overlay",  label: "Bottom Card"                },
  { key: "cad-overlay",          label: "CAD Overlay"                 },
];

export const OBJECTIVE_LAYOUTS: { key: ObjectiveLayoutKey; label: string }[] = [
  { key: "light-statement",   label: "Light Statement"   },
  { key: "dark-statement",    label: "Dark Statement"    },
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

export const CORE_VALUES_LAYOUTS: { key: CoreValuesLayoutKey; label: string }[] = [
  { key: "quad-grid", label: "Quad Grid" },
  { key: "cards-row", label: "Cards Row" },
  { key: "labeled-list", label: "Labeled List" },
  { key: "icon-cards", label: "Icon Cards" },
];

export const PROJECT_TIMELINE_LAYOUTS: { key: ProjectTimelineLayoutKey; label: string }[] = [
  { key: "vertical-dot", label: "Vertical Dot" },
  { key: "vertical-alternating", label: "Alternating" },
  { key: "stepped-hierarchy", label: "Stepped" },
];

export const COPE_PAGE_LAYOUTS: { key: CopePageLayoutKey; label: string }[] = [
  { key: "icon-columns", label: "Icon Columns" },
  { key: "quad-photos", label: "Quad Photos" },
  { key: "annotated-diagram", label: "Annotated Diagram" },
];

export const DESIGN_RETAINER_LAYOUTS: { key: DesignRetainerLayoutKey; label: string }[] = [
  { key: "centered-hero", label: "Centered Hero" },
  { key: "framed-card", label: "Framed Card" },
  { key: "dark-overlay-modal", label: "Dark Overlay" },
];

export const NEXT_STEPS_LAYOUTS: { key: NextStepsLayoutKey; label: string }[] = [
  { key: "numbered-photo", label: "Numbered + Photo" },
  { key: "column-grid-photos", label: "Column Grid" },
  { key: "two-by-two-grid", label: "2\u00d72 Grid" },
  { key: "large-number-hero", label: "Large Number Hero" },
];

export const CLOSING_SLIDE_LAYOUTS: { key: ClosingSlideLayoutKey; label: string }[] = [
  { key: "dark-centered", label: "Dark Centered" },
  { key: "light-logo-centered", label: "Light Logo" },
  { key: "photo-white-card", label: "Photo + Card" },
];

export const CLIENT_TESTIMONIALS_LAYOUTS: { key: ClientTestimonialsLayoutKey; label: string }[] = [
  { key: "quote-cards", label: "Quote Cards" },
  { key: "single-feature", label: "Feature Quote" },
  { key: "photo-overlay", label: "Photo Overlay" },
];

export const DESIGN_BUILD_ADVANTAGE_LAYOUTS: { key: DesignBuildAdvantageLayoutKey; label: string }[] = [
  { key: "icon-cards", label: "Icon Cards" },
  { key: "bold-guarantee", label: "Bold Guarantee" },
  { key: "quad-grid", label: "Quad Grid" },
  { key: "cycle-diagram", label: "Cycle Diagram" },
];

export const VISUAL_INSPIRATION_LAYOUTS: { key: VisualInspirationLayoutKey; label: string }[] = [
  { key: "hero-plus-stacked", label: "Hero + Stacked" },
  { key: "masonry-grid", label: "Masonry Grid" },
  { key: "side-by-side-bleed", label: "Side by Side" },
];

export const ADDITION_OVERVIEW_LAYOUTS: { key: AdditionOverviewLayoutKey; label: string }[] = [
  { key: "photo-cad-overlay", label: "CAD Overlay" },
  { key: "photo-bullet-card", label: "Photo + Card" },
  { key: "combined", label: "Combined" },
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
    case "core-values":
      return CORE_VALUES_LAYOUTS;
    case "project-timeline":
      return PROJECT_TIMELINE_LAYOUTS;
    case "cope-page":
      return COPE_PAGE_LAYOUTS;
    case "design-retainer":
      return DESIGN_RETAINER_LAYOUTS;
    case "next-steps":
      return NEXT_STEPS_LAYOUTS;
    case "closing-slide":
      return CLOSING_SLIDE_LAYOUTS;
    case "visual-inspiration":
      return VISUAL_INSPIRATION_LAYOUTS;
    case "client-testimonials":
      return CLIENT_TESTIMONIALS_LAYOUTS;
    case "design-build-advantage":
      return DESIGN_BUILD_ADVANTAGE_LAYOUTS;
    case "addition-overview":
      return ADDITION_OVERVIEW_LAYOUTS;
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
  "core-values":     "Core Values",
  "project-timeline": "Timeline",
  "cope-page":        "COPE",
  "design-retainer":  "Design Retainer",
  "next-steps":       "Next Steps",
  "closing-slide":    "Closing",
  "visual-inspiration": "Inspiration",
  "client-testimonials": "Testimonials",
  "design-build-advantage": "Design-Build",
  "addition-overview": "Addition Overview",
};
