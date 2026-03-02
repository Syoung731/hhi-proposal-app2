/**
 * Browser-safe layout config: types and getLayoutConfig only.
 * NO prisma, @prisma/adapter-pg, or server-only code.
 */

/** Full presentation config stored on Proposal.publicLayoutConfig (single JSON object). */
export type PresentationConfigSaved = {
  version?: number;
  transitions?: { mode?: "none" | "fade" | "slide" };
  pages?: {
    cover?: { variant?: "heroOverlay" | "splitCover" | "titlePlate"; heroMediaId?: string | null };
    objective?: { variant?: "twoColGallery" | "fullBleedQuote" };
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

/** Ordered section config for the magazine nav. roomSlug is either slugified name or room id for uniqueness. */
export type ProposalSection = {
  href: string;
  label: string;
  type: "page" | "room";
};
