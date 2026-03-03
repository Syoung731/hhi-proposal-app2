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
   * Template B–scoped settings: underline and divider colors.
   * When templateId === "B", used for headline underline and column divider colors.
   */
  templateB?: { underlineColor?: string; dividerColor?: string };
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

/** Live-view presentation settings: background, page transition, speed. */
export type PresentationSettings = {
  background?: "light" | "dark" | "warm" | "imageOverlay";
  transition?: "none" | "fade" | "slide";
  speed?: "slow" | "normal" | "fast";
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
    whyUs?: { variant?: "gridCards" | "iconRows" };
    rooms?: Record<string, { enabled?: boolean; variant?: string; featuredMediaId?: string | null }>;
    rollup?: { mode?: "auto" | "manual"; variant?: "simpleList"; roomIds?: string[] };
  };
};

/** Legacy flat shape (still supported for backward compat). */
export type PublicLayoutConfigSaved = {
  cover?: { variant?: "heroOverlay" | "splitCover" | "titlePlate"; heroMediaId?: string | null };
  objective?: { variant?: "twoColGallery" | "fullBleedQuote" };
  difference?: { variant?: "gridCards" | "iconRows" };
  whyUs?: { variant?: "gridCards" | "iconRows" };
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
    whyUs: { variant: "gridCards" | "iconRows" };
  };
  /** New: single source of truth for transition mode. */
  transitions: { mode: "none" | "fade" | "slide" };
  /** Legacy flat (backward compat). */
  cover: { variant: "heroOverlay" | "splitCover" | "titlePlate"; heroMediaId: string | null };
  objective: { variant: "twoColGallery" | "fullBleedQuote" };
  difference: { variant: "gridCards" | "iconRows" };
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

/** Ordered section config for the magazine nav. roomSlug is either slugified name or room id for uniqueness. */
export type ProposalSection = {
  href: string;
  label: string;
  type: "page" | "room";
};
