/**
 * Browser-safe layout config: types and getLayoutConfig only.
 * NO prisma, @prisma/adapter-pg, or server-only code.
 */

/** Template C column: icon + title + description. */
export type ObjectivePageConfigColumn = {
  iconId?: string | null;
  title?: string;
  description?: string;
};

/** Template C–scoped settings: bar color, optional subtitle, and 3 columns. */
export type ObjectivePageConfigTemplateC = {
  /** Left vertical bar background color (hex). Default muted blue-gray. */
  barColor?: string;
  /** Optional subtitle shown above the main title. */
  subtitle?: string;
  /** When true, AI "Generate 3 Columns" will not overwrite subtitle. */
  subtitleLocked?: boolean;
  /** Exactly 3 columns: icon + title + description. */
  columns?: ObjectivePageConfigColumn[];
};

/** Per-page Objective config for admin Presentation builder (stored inside pages.objective). */
export type ObjectivePageConfig = {
  /** Layout variant used by public rendering (backward compatible). */
  variant?: "twoColGallery" | "fullBleedQuote";
  /** Template identifier for the Objective editor. "A" is default (Template A — Text + Commitments + Photo Collage). */
  templateId?: "A" | "B" | "C";
  /** Editable title for Template A (defaults to "Project Objective"). For Template C this is the Executive Label (vertical left bar, required). */
  title?: string;
  /**
   * Shared subtitle used by all Objective templates.
   * For Template C this is the main headline above the paragraph.
   * Stored at the top level so it survives template switching.
   */
  subtitle?: string;
  /** Main objective paragraph text. */
  objectiveText?: string;
  /** Up to 3 short key commitments. */
  commitments?: string[];
  /** Fixed 3-photo collage slots referencing LibraryMedia by ID. */
  photoSlots?: { libraryMediaId?: string | null }[];
  /** Template C: vertical left label override; when unset, title is used. */
  executiveLabel?: string;
  /** Template C: exactly 3 columns (icon + title + description). Kept for backward compat; templateC.columns takes precedence when present. */
  columns?: ObjectivePageConfigColumn[];
  /**
   * Template C–scoped settings: bar color and columns.
   * subtitle here is legacy; consumers should prefer the top-level subtitle
   * and only fall back to templateC.subtitle when migrating older configs.
   * When templateId === "C", normalized so templateC exists, barColor has default, columns length 3.
   */
  templateC?: ObjectivePageConfigTemplateC;
  /**
   * Template B–scoped statement override: shorter copy that fits the B layout (no truncation).
   * When templateId === "B", this is shown instead of objectiveText when set.
   */
  objectiveTextB?: string;
  /**
   * Template B–scoped settings: underline and divider colors, plus fit-copy metadata.
   * When templateId === "B", used for headline underline and column divider colors.
   */
  templateB?: {
    underlineColor?: string;
    dividerColor?: string;
    /** ISO string when Template B fit statement was last generated. */
    objectiveTextBLastFitAt?: string | null;
    /** Hash of objectiveText at time of last fit (to avoid re-running when base unchanged). */
    objectiveTextBSourceHash?: string | null;
  };
  /** AI helper state for suggested copy / filters / photos (editor-only). */
  ai?: {
    /** Suggested objective paragraph (2–3 concise sentences) from AI. */
    suggestedObjectiveParagraph?: string;
    /** Suggested key commitments (up to 3 short phrases) from AI. */
    suggestedCommitments?: string[];
    /** Suggested sections used to filter photos. */
    suggestedSections?: string[];
    /** Suggested tags used to filter photos. */
    suggestedTags?: string[];
    /** Suggested photo IDs for quick apply. */
    suggestedPhotoIds?: string[];
    /** ISO string of last AI copy run (objective/commitments). */
    copyLastRunAt?: string | null;
    /** ISO string of last AI photo/filters run (sections/tags). */
    photoLastRunAt?: string | null;
    /** Deprecated: legacy single timestamp; prefer copyLastRunAt / photoLastRunAt. */
    lastRunAt?: string | null;
    /** ISO string when user last applied AI-generated objective/commitments. */
    appliedAt?: string | null;
    /** Optional hash/signature of transcript+overview at time of apply (for future use). */
    appliedHash?: string | null;
    /** ISO string when user applied the suggested paragraph (hide paragraph suggestion block). */
    copyParagraphAppliedAt?: string | null;
    /** ISO string when user applied the suggested commitments (hide commitments suggestion block). */
    copyCommitmentsAppliedAt?: string | null;
  };
};

/** Single value pillar on the Why Us page. */
export type WhyUsPillar = {
  /** Brand icon id (from the brand icon library). */
  iconKey?: string | null;
  /** Short headline for the pillar. */
  headline?: string;
  /** Supporting body copy for the pillar. */
  body?: string;
};

/** Grid Cards–scoped style (card background and border). */
export type WhyUsGridCardsStyle = {
  /** Card background color (hex). Default "#F3F3F1". */
  cardBg?: string;
  /** Card border color (hex). Default "#1E2D3A". */
  cardBorder?: string;
};

/** Stacked Rows–scoped style (row background, title underline, vertical accent). */
export type WhyUsStackedStyle = {
  /** Row card background color (hex). Default "#F7F7F5". */
  cardBg?: string;
  /** Title underline color (hex). Default "#E07A2F". */
  underlineColor?: string;
  /** Vertical accent line color (hex). If not set, uses underlineColor. */
  accentColor?: string;
};

/** Three Columns–scoped style (headline underline, text color, and type/icon sizing). */
export type WhyUsColumnsStyle = {
  /** Title underline color (hex). Default HHI orange "#E07A2F". */
  underlineColor?: string;
  /** Column text color (hex). Default near-black "#111827". */
  textColor?: string;
  /** Per-pillar headline font size (CSS px string, e.g. "34px"). Legacy; prefer WhyUsPageConfig.style.headlineSizePx. */
  headlineSize?: string;
  /** Per-pillar body font size (CSS px string, e.g. "20px"). Legacy; prefer WhyUsPageConfig.style.bodySizePx. */
  bodySize?: string;
  /** Icon scale factor applied to a base icon size (1.0 = default). Legacy; prefer WhyUsPageConfig.style.iconScale. */
  iconScale?: number;
};

/** Hero Value Statements (Timeline)–scoped style. */
export type WhyUsSimpleStyle = {
  /**
   * Base icon size in CSS pixels used by the timeline layout.
   * Rendered icon size is iconBasePx * iconScale. Defaults to 72.
   */
  iconBasePx?: number;
  /**
   * Icon scale multiplier applied to iconBasePx. Defaults to 1.0 when unset.
   */
  iconScale?: number;
  /**
   * Timeline dot color (hex). Defaults to the runtime accent/underline color
   * when unset or invalid.
   */
  dotColor?: string;
};

/** Shared Why Us style controls applied across templates (headline/body text and icon scale). */
export type WhyUsSharedStyle = {
  /** Shared pillar headline font size in CSS pixels. */
  headlineSizePx?: number;
  /** Shared pillar body font size in CSS pixels. */
  bodySizePx?: number;
  /** Shared icon scale factor applied to base icon sizes (1.0 = default). */
  iconScale?: number;
  /**
   * Hero Value Statements only: multiplier applied to headlineSizePx
   * for per-statement value headlines. Defaults to 1.6 when unset.
   */
  heroHeadlineScale?: number;
  /**
   * Hero Value Statements only: vertical spacing between value
   * statements in CSS pixels. Defaults to 36 when unset.
   */
  heroStatementSpacingPx?: number;
  /**
   * Hero Value Statements (Timeline) only: per-milestone headline
   * font size in CSS pixels. Defaults to 32 when unset.
   */
  simpleHeadlineSizePx?: number;
  /**
   * Hero Value Statements (Timeline) only: per-milestone body font
   * size in CSS pixels. Defaults to 20 when unset.
   */
  simpleBodySizePx?: number;
  /**
   * Hero Value Statements (Timeline) only: dot size in CSS pixels.
   * Defaults to 12 when unset.
   */
  simpleDotSizePx?: number;
  /**
   * Hero Value Statements (Timeline) only: vertical gap between
   * milestones in CSS pixels. Defaults to 24 when unset.
   */
  simpleRowGapPx?: number;
  /**
   * Hero Value Statements (Timeline) only: icon size in CSS pixels.
   * Defaults to 28 when unset.
   */
  simpleIconSizePx?: number;
  /**
   * Hero Value Statements (Timeline) only: whether to render icons
   * next to the timeline dots. Defaults to true when unset.
   */
  simpleShowIcons?: boolean;
  /**
   * Hero Value Statements (Timeline) only: when true, center-align
   * the title and underline instead of left-aligning.
   */
  simpleCenterTitle?: boolean;
};

/** Per-page Why Us config for admin Presentation builder (stored inside pages.whyUs). */
export type WhyUsPageConfig = {
  /** Layout variant used by the public Why Us renderer. */
  variant?: "gridCards" | "stacked" | "columns" | "simple" | "iconRows";
  /** Section title shown above the pillars. */
  title?: string;
  /** Up to 4 value pillars. */
  pillars?: WhyUsPillar[];
  /**
   * Shared typography and icon sizing used across all Why Us templates.
   * When unset, each renderer falls back to its current template-specific defaults
   * so existing projects keep their visual appearance.
   */
  style?: WhyUsSharedStyle;
  /** Grid Cards only: card background and border colors. */
  gridCardsStyle?: WhyUsGridCardsStyle;
  /** Stacked Rows only: row background, underline, and accent colors. */
  stackedStyle?: WhyUsStackedStyle;
  /** Three Columns only: underline, icon tint, and text color. */
  columnsStyle?: WhyUsColumnsStyle;
  /** Hero Value Statements (Timeline) only: icon and dot styling. */
  simpleStyle?: WhyUsSimpleStyle;
  /**
   * Hero Value Statements only: optional footer note rendered at the
   * bottom of the timeline layout.
   */
  simpleFooterText?: string;
  /**
   * Visible pillars by index (up to 4).
   * Defaults to [true, true, true, false] when omitted or partially specified.
   */
  visiblePillars?: boolean[];
};

/** Live-view presentation settings: background, page transition, speed. */
export type PresentationSettings = {
  background?: "light" | "dark" | "warm" | "imageOverlay";
  transition?: "none" | "fade" | "slide";
  speed?: "slow" | "normal" | "fast";
};

/** Per-section (room) page config: include toggle, layout variant, featured concept image, before/after media. */
export type SectionPageConfig = {
  /** Include this section as its own page in the proposal (default: true). */
  include?: boolean;
  /** Layout variant for the section page: split = Before/After, heroAfter, storyboard, comparisonCollage = Template 4. */
  layoutVariant?: "split" | "heroAfter" | "storyboard" | "comparisonCollage";
  /** Template 1 layout density: 1 = 1-up (large), 2 = 2-up (medium), 3 = 3-up (small). Default 2. */
  splitDensity?: 1 | 2 | 3;
  /** Featured After Image (shows first in After column). Null = use selected order. */
  featuredConceptMediaId?: string | null;
  /** Before photos (existing) media IDs for Template 1; max length = splitDensity. */
  beforeSelectedMediaIds?: string[];
  /** After renderings media IDs for Template 1; max length = splitDensity. */
  afterSelectedMediaIds?: string[];
  /** Template 4: completed-project/reference photo library IDs; max 3. */
  referencePhotoIds?: string[];
  /** @deprecated Use beforeSelectedMediaIds. Kept for backward compat. */
  beforeMediaIds?: string[];
  /** @deprecated Use afterSelectedMediaIds. Kept for backward compat. */
  afterMediaIds?: string[];
  /** Template 1 scope panel height: S = 18%, M = 24%, L = 30% of slide. @deprecated Use scopeAreaPct. */
  scopeSize?: "S" | "M" | "L";
  /** Template 1 title font size multiplier. Default 1.2. Range 0.9–1.6. */
  titleScale?: number;
  /** Template 1 photo row height as % of slide. Default 62. Range 45–75. Remaining space after title + auto scope. */
  photoAreaPct?: number;
  /** Template 1 scope row height as % of slide. @deprecated For split layout, scope height is auto-sized from content; this field is no longer used for layout. Kept for stored config. */
  scopeAreaPct?: number;
  /** Template 1 scope body text size scale. Default 1.0. Range 0.85–1.25. */
  scopeTextScale?: number;
};

/** Additional Sections (rollup) page config. */
export type AdditionalSectionsConfig = {
  /** Include the Additional Sections page in the proposal (default: true). */
  include?: boolean;
};

/** Sections config: keyed by section/room id, plus reserved key additionalSections. */
export type SectionsConfigMap = Record<string, SectionPageConfig> & {
  additionalSections?: AdditionalSectionsConfig;
};

/** Full presentation config stored on Proposal.publicLayoutConfig (single JSON object). */
export type PresentationConfigSaved = {
  version?: number;
  /** Live-view settings (background, transition, speed). */
  settings?: PresentationSettings;
  transitions?: { mode?: "none" | "fade" | "slide" };
  pages?: {
    cover?: { variant?: "heroOverlay" | "splitCover" | "titlePlate"; heroMediaId?: string | null };
    /**
     * Objective page config.
     * - variant is used by the public Objective page renderer.
     * - Template / AI fields are editor-only and safe to ignore at render time.
     */
    objective?: ObjectivePageConfig;
    whyUs?: WhyUsPageConfig;
    /** Section (room) pages config. Key = section/room id; use getSectionConfigKey when iterating to skip additionalSections. */
    sections?: SectionsConfigMap;
    rooms?: Record<
      string,
      {
        enabled?: boolean;
        variant?: string;
        featuredMediaId?: string | null;
        /** Whether this room page is included in the published presentation navigation (default: true). */
        published?: boolean;
      }
    >;
    rollup?: {
      mode?: "auto" | "manual";
      variant?: "simpleList";
      roomIds?: string[];
      /** Whether the Additional Sections page is included in the published presentation (default: true). */
      published?: boolean;
    };
  };
};

/** Legacy flat shape (still supported for backward compat). */
export type PublicLayoutConfigSaved = {
  cover?: { variant?: "heroOverlay" | "splitCover" | "titlePlate"; heroMediaId?: string | null };
  objective?: { variant?: "twoColGallery" | "fullBleedQuote" };
  difference?: { variant?: "gridCards" | "iconRows" };
  /** Legacy flat Why Us config (variant only). */
  whyUs?: { variant?: "gridCards" | "stacked" | "columns" | "simple" | "iconRows" };
  animations?: { mode?: "none" | "fade" | "slide" };
  /** New nested shape takes precedence when present */
  pages?: PresentationConfigSaved["pages"];
  transitions?: { mode?: "none" | "fade" | "slide" };
};

/** Merged layout config with defaults applied (used for rendering). */
export type PublicLayoutConfig = {
  /** New nested shape (preferred). */
  pages: {
    cover: { variant: "heroOverlay" | "splitCover" | "titlePlate"; heroMediaId: string | null };
    objective: { variant: "twoColGallery" | "fullBleedQuote" };
    whyUs: { variant: "gridCards" | "stacked" | "columns" | "simple" | "iconRows" };
  };
  /** New: single source of truth for transition mode. */
  transitions: { mode: "none" | "fade" | "slide" };
  /** Legacy flat (backward compat). */
  cover: { variant: "heroOverlay" | "splitCover" | "titlePlate"; heroMediaId: string | null };
  objective: { variant: "twoColGallery" | "fullBleedQuote" };
  difference: { variant: "gridCards" | "stacked" | "columns" | "simple" | "iconRows" };
  /** Legacy; mirrors transitions.mode for backward compat. */
  animations: { mode: "none" | "fade" | "slide" };
};

const DEFAULT_LAYOUT_CONFIG: PublicLayoutConfig = {
  pages: {
    cover: { variant: "heroOverlay", heroMediaId: null },
    objective: { variant: "twoColGallery" },
    whyUs: { variant: "gridCards" },
  },
  transitions: { mode: "fade" },
  cover: { variant: "heroOverlay", heroMediaId: null },
  objective: { variant: "twoColGallery" },
  difference: { variant: "gridCards" },
  animations: { mode: "fade" },
};

/**
 * Merges saved config (from Proposal or snapshot) with defaults.
 * Accepts both nested (PresentationConfigSaved) and legacy flat (PublicLayoutConfigSaved) shapes.
 */
export function getLayoutConfig(
  saved: PublicLayoutConfigSaved | PresentationConfigSaved | null | undefined
): PublicLayoutConfig {
  if (!saved || typeof saved !== "object") return DEFAULT_LAYOUT_CONFIG;
  const coverVariants: PublicLayoutConfig["cover"]["variant"][] = [
    "heroOverlay",
    "splitCover",
    "titlePlate",
  ];
  const p =
    "pages" in saved &&
    saved.pages != null &&
    typeof saved.pages === "object" &&
    !Array.isArray(saved.pages)
      ? saved.pages
      : undefined;
  const leg = saved as PublicLayoutConfigSaved;
  const cover = p?.cover ?? leg.cover;
  const objective = p?.objective ?? leg.objective;
  const whyUs = p?.whyUs ?? leg.difference ?? leg.whyUs;
  const transitionsMode =
    (saved as PresentationConfigSaved).transitions?.mode ??
    leg.animations?.mode ??
    DEFAULT_LAYOUT_CONFIG.transitions.mode;
  const transitionsModeResolved: PublicLayoutConfig["transitions"]["mode"] =
    transitionsMode === "none" || transitionsMode === "fade" || transitionsMode === "slide"
      ? transitionsMode
      : DEFAULT_LAYOUT_CONFIG.transitions.mode;

  const coverVal = {
    variant: cover?.variant && coverVariants.includes(cover.variant as "heroOverlay")
      ? (cover.variant as PublicLayoutConfig["cover"]["variant"])
      : DEFAULT_LAYOUT_CONFIG.cover.variant,
    heroMediaId: cover?.heroMediaId ?? DEFAULT_LAYOUT_CONFIG.cover.heroMediaId,
  };
  const objectiveVal = {
    variant: objective?.variant ?? DEFAULT_LAYOUT_CONFIG.objective.variant,
  };
  const differenceVal = {
    variant: whyUs?.variant ?? DEFAULT_LAYOUT_CONFIG.difference.variant,
  };

  return {
    pages: {
      cover: coverVal,
      objective: objectiveVal,
      whyUs: differenceVal,
    },
    transitions: { mode: transitionsModeResolved },
    cover: coverVal,
    objective: objectiveVal,
    difference: differenceVal,
    animations: { mode: transitionsModeResolved },
  };
}

/** Default left vertical bar color for Template C (muted blue-gray). */
export const TEMPLATE_C_DEFAULT_BAR_COLOR = "#64748b";

/** Default underline color for Objective Template B when branding accent is missing. */
export const TEMPLATE_B_DEFAULT_UNDERLINE_COLOR = "#F97316";

/** Default divider/grid line color for Objective Template B (Tailwind neutral-200 equivalent). */
export const TEMPLATE_B_DEFAULT_DIVIDER_COLOR = "#E5E7EB";

/** Max length for Template C column title (prevents overflow in preview/public). */
export const TEMPLATE_C_TITLE_MAX_LENGTH = 40;

/** Max length for Template C column description (prevents overflow in preview/public). */
export const TEMPLATE_C_DESCRIPTION_MAX_LENGTH = 240;

/**
 * Normalize Template C columns: use templateC.columns or top-level columns, pad/trim to length 3.
 */
export function getTemplateCColumns(config: ObjectivePageConfig): ObjectivePageConfigColumn[] {
  const raw =
    config.templateC?.columns ?? config.columns;
  const base = Array.isArray(raw) ? raw.slice(0, 3) : [];
  const out = base.map((c) => ({ ...c }));
  while (out.length < 3) out.push({});
  return out;
}

/**
 * Template C left bar color. Uses templateC.barColor if set and valid, otherwise
 * branding accent color (e.g. CompanySettings.primaryColorHex), then TEMPLATE_C_DEFAULT_BAR_COLOR.
 */
export function getTemplateCBarColor(
  config: ObjectivePageConfig,
  accentColor?: string | null
): string {
  const hex = config.templateC?.barColor?.trim();
  if (hex && /^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
  const accent = accentColor?.trim();
  if (accent && /^#[0-9A-Fa-f]{6}$/.test(accent)) return accent;
  return TEMPLATE_C_DEFAULT_BAR_COLOR;
}

/**
 * Runtime underline color for Objective Template B.
 * Precedence: config.templateB.underlineColor → branding accent → default.
 */
export function getTemplateBUnderlineColor(
  config: { templateB?: { underlineColor?: string } } | null | undefined,
  brandingAccentColor?: string | null
): string {
  const raw = config?.templateB?.underlineColor?.trim();
  if (raw && /^#[0-9A-Fa-f]{6}$/.test(raw)) return raw;
  const accent = brandingAccentColor?.trim();
  if (accent && /^#[0-9A-Fa-f]{6}$/.test(accent)) return accent;
  return TEMPLATE_B_DEFAULT_UNDERLINE_COLOR;
}

/**
 * Runtime divider/grid line color for Objective Template B.
 * Precedence: config.templateB.dividerColor → TEMPLATE_B_DEFAULT_DIVIDER_COLOR.
 */
export function getTemplateBDividerColor(
  config: { templateB?: { dividerColor?: string } } | null | undefined
): string {
  const raw = config?.templateB?.dividerColor?.trim();
  if (raw && /^#[0-9A-Fa-f]{6}$/.test(raw)) return raw;
  return TEMPLATE_B_DEFAULT_DIVIDER_COLOR;
}

/** Default card background for Grid Cards. */
export const GRID_CARDS_DEFAULT_CARD_BG = "#F3F3F1";
/** Default card border for Grid Cards. */
export const GRID_CARDS_DEFAULT_CARD_BORDER = "#1E2D3A";

/** Stacked Rows defaults (row bg, title underline, vertical accent). */
export const STACKED_DEFAULT_CARD_BG = "#F7F7F5";
export const STACKED_DEFAULT_UNDERLINE_COLOR = "#E07A2F";

/** Three Columns defaults. */
export const COLUMNS_DEFAULT_UNDERLINE_COLOR = STACKED_DEFAULT_UNDERLINE_COLOR;
export const COLUMNS_DEFAULT_TEXT_COLOR = "#111827";
export const COLUMNS_DEFAULT_ICON_COLOR = COLUMNS_DEFAULT_TEXT_COLOR;

/**
 * Validates and returns a hex color string, or the default.
 */
export function sanitizeHexColor(
  value: string | undefined | null,
  defaultHex: string
): string {
  const raw = value?.trim();
  if (raw && /^#[0-9A-Fa-f]{6}$/.test(raw)) return raw;
  return defaultHex;
}

/** Ordered section config for the magazine nav. roomSlug is either slugified name or room id for uniqueness. */
export type ProposalSection = {
  href: string;
  label: string;
  type: "page" | "room";
};
