import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { callClaude } from "@/app/lib/ai/model";
import { generateSlideBackground } from "@/app/lib/gemini";
import { uploadBuffer } from "@/app/lib/s3";
import { resolveScopeIconImages, resolveDuotoneIconImages, scopeIconSlug } from "@/app/lib/deck/scope-icon-resolver";
import { SCOPE_ICON_KEY_LIST, isScopeIconKey } from "@/app/lib/deck/scope-icon-keys";
import { generateBrandIconPngAction } from "@/app/admin/settings/actions";
import { mapWithConcurrency, sleep } from "@/app/lib/async-pool";
import {
  SCOPE_OVERVIEW_LAYOUTS,
  COVER_LAYOUTS,
  SCOPE_BREAKDOWN_LAYOUTS,
  COPE_PAGE_LAYOUTS,
  DESIGN_EXPERIENCE_LAYOUTS,
  WHY_US_LAYOUTS,
  PROJECT_TIMELINE_LAYOUTS,
  INVESTMENT_LAYOUTS,
  DESIGN_RETAINER_LAYOUTS,
  CLOSING_SLIDE_LAYOUTS,
  FLOOR_PLAN_LAYOUTS,
  CRAFTSMANSHIP_LAYOUTS,
} from "@/app/lib/deck/types";

/**
 * Generic, prompt-driven "AI Edit" engine — the deck's universal smart box.
 *
 * A single Claude call reads the user's plain-language instruction and the
 * slide's editable surface (declared per slide type by a CAPABILITY DESCRIPTOR)
 * and returns a structured PLAN: which copy/style/layout to change, whether to
 * (re)generate a background image, swap a photo, or refresh icons. The engine
 * executes the parts the slide supports and returns a single patch the CLIENT
 * applies via onUpdate — so it flows through the normal autosave + isUserModified
 * path AND the per-slide undo stack.
 *
 * Adding a new slide type = adding one descriptor entry (the box degrades to
 * "headline + background only" for types without one).
 */

// ─── Capability descriptors ───────────────────────────────────────────────────

type StyleKind = "color" | "size" | "boolean" | "enum";
type StyleField = { key: string; kind: StyleKind; values?: string[]; desc: string };
type ItemSpec = {
  key: string;
  fields: string[];
  iconField?: string;
  /** Resolve an AI BrandIcon PNG per item (scope blueprint style) on icon refresh. */
  supportsIconPng?: boolean;
  /** Icon fidelity for regenerateIcons. "mono" = single-colour line art (mask-tinted);
   *  "duotone" = navy+orange line icon rendered un-masked. Default "mono". */
  iconStyle?: "mono" | "duotone";
  /** The required field that identifies a non-empty item. Default "title". */
  titleField?: string;
  /** Fields carried over from the existing item at the same index (e.g. id, isIncluded). */
  preserveFields?: string[];
  /** When set, "regenerate illustrations" draws a bespoke line-art per item into this field. */
  illustrationField?: string;
  /** Drawing style for per-item illustrations. Default "scene". */
  illustrationStyle?: "scene" | "isometric";
  max?: number;
  desc: string;
};
type PhotoField = { key: "selectedPhotos" | "heroImageUrl"; multiple: boolean };

/**
 * Bespoke line-art illustration support (the Objective hub-and-spoke: a center
 * "hub" home drawing + a per-zone illustration). Distinct from icon PNGs.
 */
type IllustrationSpec = {
  hubSceneKey: string;
  hubImageKey: string;
  hubIconKey: string;
  itemSceneField: string;
  itemImageField: string;
};

type SlideEditDescriptor = {
  /** Editable plain-text content fields (besides headline). */
  copyFields: { key: string; desc: string }[];
  /** Whether the slide headline (top-level slide.headline) is editable. */
  headline: boolean;
  /**
   * Whether the slide subheadline (top-level slide.subheadline) is editable.
   * NOTE: on the Cover, subheadline is the LARGE serif title and headline is the
   * small project-name label — see `desc` strings in the cover descriptor.
   */
  subheadline?: { desc: string };
  /** Optional custom label for the headline field in the planner prompt. */
  headlineDesc?: string;
  /** Optional structured item array (bullets / zones / pillars). */
  items?: ItemSpec;
  /** Editable style fields (colors, sizes, enums, booleans). */
  styleFields: StyleField[];
  /** Content keys that accept a single scope-icon key (e.g. the Objective hub). */
  iconKeyFields?: string[];
  /** Allowed layout keys. */
  layouts: string[];
  /** Where the chosen layout is written: top-level slide.layoutKey, or content.layout. */
  layoutTarget: "slide" | "content";
  supportsBackground: boolean;
  /** Whether items carry icons that can be (re)generated on request. */
  supportsIcons: boolean;
  /** Bespoke hub + zone line-art illustrations (Objective). */
  illustrations?: IllustrationSpec;
  photoField?: PhotoField;
};

const DESCRIPTORS: Record<string, SlideEditDescriptor> = {
  "scope-overview": {
    headline: true,
    copyFields: [
      { key: "intro", desc: "short framing sentence (Editorial 'Vision' card)" },
      { key: "stat", desc: "bold accent stat subtitle (Blueprint layout)" },
      { key: "description", desc: "paragraph-form scope summary (used in Paragraph mode)" },
    ],
    items: {
      key: "scopeItems",
      fields: ["title", "detail", "icon"],
      iconField: "icon",
      supportsIconPng: true,
      max: 6,
      desc: "scope bullet items, each {title (2-4 words), detail (one line), icon}",
    },
    styleFields: [
      { key: "accentColor", kind: "color", desc: "accent (eyebrow + rules)" },
      { key: "titleColor", kind: "color", desc: "slide title color" },
      { key: "iconColor", kind: "color", desc: "Blueprint icon/check color" },
      { key: "itemTitleColor", kind: "color", desc: "Blueprint bold item-title color" },
      { key: "panelColor", kind: "color", desc: "Editorial left panel background" },
      { key: "panelTextColor", kind: "color", desc: "Editorial left panel text" },
      { key: "titleSize", kind: "size", desc: "title size multiplier (0.5-4)" },
      { key: "scopeItemsSize", kind: "size", desc: "item text size multiplier (0.5-2)" },
      { key: "scopeIconSize", kind: "size", desc: "icon size multiplier (0.5-2)" },
      { key: "itemMarker", kind: "enum", values: ["icon", "check", "none"], desc: "Blueprint item marker" },
      { key: "backgroundSkin", kind: "enum", values: ["blueprint", "none"], desc: "Blueprint grid background" },
      { key: "showSectionLabel", kind: "boolean", desc: "show the 'Project Scope' eyebrow" },
      { key: "showItemIcons", kind: "boolean", desc: "Editorial: show item icons" },
    ],
    layouts: SCOPE_OVERVIEW_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: true,
    photoField: { key: "selectedPhotos", multiple: false },
  },

  cope: {
    // COPE = "Cost of Project Execution" categories. Title is slide.headline.
    headline: true,
    headlineDesc: "the slide title (e.g. 'The Cost of Project Execution')",
    copyFields: [
      { key: "sectionLabel", desc: "small uppercase eyebrow label" },
      { key: "subheadline", desc: "one-line intro under the title" },
    ],
    items: {
      key: "items",
      fields: ["title", "description", "bullets"],
      titleField: "title",
      preserveFields: ["id"],
      supportsIconPng: true,
      max: 6,
      desc: "execution categories, each {title (2-4 words), description (one short line), bullets (array of 1-3 very short lines)}. Return the FULL array in the SAME ORDER; don't add or drop categories.",
    },
    styleFields: [{ key: "accentColor", kind: "color", desc: "accent color" }],
    layouts: COPE_PAGE_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: true,
  },

  "design-experience": {
    // The project "journey" — ordered stages from design to fixed-price contract.
    // Title is slide.headline.
    headline: true,
    headlineDesc: "the slide title (e.g. 'Your Design Experience')",
    copyFields: [
      { key: "sectionLabel", desc: "small uppercase eyebrow label" },
      { key: "subheadline", desc: "one-line caption under the journey" },
    ],
    items: {
      key: "stages",
      fields: ["title", "description"],
      titleField: "title",
      preserveFields: ["id"],
      supportsIconPng: true,
      iconStyle: "duotone",
      max: 6,
      desc: "ordered journey stages, each {title (2-5 words), description (one short line)}. Return the FULL array in the SAME ORDER; don't add or drop stages unless asked.",
    },
    styleFields: [
      { key: "accentColor", kind: "color", desc: "accent color" },
      { key: "stepWord", kind: "enum", values: ["Stage", "Stop", "Phase", "Step", ""], desc: "word before the step number" },
    ],
    layouts: DESIGN_EXPERIENCE_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: true,
  },

  "why-us": {
    // "Why Us" — the comparison layouts (Traditional vs HHI). Title is content.sectionTitle || slide.headline.
    headline: true,
    headlineDesc: "the slide title (e.g. 'The HHI Difference' or 'The HHI Standard vs. Traditional Builders')",
    copyFields: [
      { key: "sectionTitle", desc: "the main heading shown above the comparison (overrides the slide title)" },
      { key: "comparisonLeftHeader", desc: "left / 'Traditional' column header" },
      { key: "comparisonRightHeader", desc: "right / 'HHI' column header" },
      { key: "comparisonBottom", desc: "closing one-line promise under the comparison (empty string to hide it)" },
    ],
    items: {
      key: "comparisonRows",
      fields: ["label", "traditional", "hhiTitle", "hhi"],
      titleField: "traditional",
      preserveFields: ["id"],
      max: 6,
      desc: "Traditional-vs-HHI rows, each {label (1-3 word category for the matrix's left column), traditional (the pain point, one line), hhiTitle (2-4 word bold lead-in), hhi (the HHI win, one line)}. Return the FULL array in the SAME ORDER unless asked to add/drop rows.",
    },
    styleFields: [
      { key: "accentColor", kind: "color", desc: "accent color (orange checks, top stripe, rules)" },
      { key: "comparisonHeaderSize", kind: "size", desc: "column-header text size multiplier (0.6-1.6)" },
      { key: "comparisonTitleSize", kind: "size", desc: "row-label / HHI lead-in size multiplier (0.6-1.6)" },
      { key: "comparisonBodySize", kind: "size", desc: "description text size multiplier (0.6-1.6)" },
      { key: "showRowLabels", kind: "boolean", desc: "matrix: show the left row-label column" },
    ],
    layouts: WHY_US_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: false,
  },

  timeline: {
    // Projected Timeline. NOTE: no `items` spec on purpose — phase names,
    // durations, and descriptions sync unconditionally from the project's
    // Timeline tab (syncProjectTimelineSlide), so an AI rewrite of phase copy
    // would be silently reverted on the next deck load. Phase text is edited
    // on the Timeline tab; the AI box handles style/layout/background.
    headline: true,
    headlineDesc: "the slide title (e.g. 'Projected Timeline')",
    copyFields: [
      { key: "sectionLabel", desc: "small uppercase eyebrow label (e.g. 'YOUR PROJECT')" },
      { key: "footnoteText", desc: "optional footnote line at the bottom (empty/null to hide)" },
    ],
    styleFields: [
      { key: "accentColor", kind: "color", desc: "accent color (axis segments, chevrons, dots, rules)" },
      { key: "headlineColor", kind: "color", desc: "headline color" },
      { key: "headlineSize", kind: "size", desc: "headline size multiplier (0.5-4)" },
      { key: "sectionLabelColor", kind: "color", desc: "eyebrow label color" },
      { key: "footnoteColor", kind: "color", desc: "footnote color" },
      { key: "footnoteSize", kind: "size", desc: "footnote size multiplier (0.5-4)" },
      { key: "dotSize", kind: "size", desc: "dot size multiplier on Vertical Dot / Horizon Wave (0.5-4)" },
      { key: "showSectionLabel", kind: "boolean", desc: "show the eyebrow label" },
    ],
    layouts: PROJECT_TIMELINE_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: false,
  },

  "investment-by-space": {
    // Per-space budget breakdown. NOTE: no `items` spec on purpose — line items
    // (labels AND dollar ranges) sync from the Investment tab, and money is
    // never AI-rewritten. The AI box handles copy chrome, colors, sizes,
    // toggles, layout, and background.
    headline: true,
    headlineDesc: "the slide title (e.g. 'Investment by Space')",
    copyFields: [
      { key: "footnoteText", desc: "Range Bars bottom note band (empty string to hide)" },
      { key: "guaranteeBadgeText", desc: "circular guarantee badge copy (Range Bars)" },
      { key: "constructionTotalLabel", desc: "money-anchor label (e.g. 'Projected Construction Investment')" },
      { key: "retainerCaption", desc: "retainer foundation caption (Stacked Blocks)" },
    ],
    styleFields: [
      { key: "accentColor", kind: "color", desc: "accent color" },
      { key: "barColor", kind: "color", desc: "Range Bars bar color (light tail + numbers follow)" },
      { key: "tableHeaderBgColor", kind: "color", desc: "Table layout header-bar color" },
      { key: "bodyTextScale", kind: "size", desc: "global body text scale (0.5-2)" },
      { key: "barLabelSize", kind: "size", desc: "Range Bars space-label size (0.5-2)" },
      { key: "barValueSize", kind: "size", desc: "Range Bars dollar-number size (0.5-2)" },
      { key: "barNoteSize", kind: "size", desc: "Range Bars bottom-note size (0.5-2)" },
      { key: "badgeSize", kind: "size", desc: "guarantee badge size (0.5-2)" },
      { key: "blockTextSize", kind: "size", desc: "Stacked Blocks block-text size (0.5-2)" },
      { key: "towerWidth", kind: "size", desc: "Stacked Blocks tower width (0.5-2)" },
      { key: "anchorTextSize", kind: "size", desc: "money-anchor text size (0.5-2)" },
      { key: "retainerTextSize", kind: "size", desc: "retainer element text size (0.5-2)" },
      { key: "zoneTextSize", kind: "size", desc: "Blueprint zones-list text size (0.5-2)" },
      { key: "showGuaranteeBadge", kind: "boolean", desc: "show the circular guarantee badge (Range Bars)" },
      { key: "showConstructionTotal", kind: "boolean", desc: "show the money anchor" },
      { key: "showRetainer", kind: "boolean", desc: "show the retainer element (Stacked Blocks / Blueprint)" },
    ],
    layouts: INVESTMENT_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: false,
  },

  "overall-investment": {
    // The retainer story + close. NOTE: dollar figures (retainer amount,
    // construction range) sync from the project and are never AI-rewritten.
    headline: true,
    headlineDesc:
      "the slide title (e.g. 'Your investment', 'The Design Retainer as an Insurance Policy', or 'The Next Step: Bringing the Project to Life')",
    copyFields: [
      { key: "sectionLabel", desc: "small uppercase eyebrow label (Three-Band layout)" },
      { key: "tagline", desc: "tagline under the headline (Three-Band layout)" },
      { key: "retainerLabelText", desc: "retainer band label (Three-Band layout)" },
      { key: "retainerDescText", desc: "sentence under the retainer amount (Three-Band layout)" },
      { key: "constructionLabelText", desc: "construction band label (Three-Band layout)" },
      { key: "totalLabelText", desc: "total band label (Three-Band layout)" },
      { key: "insuranceStatement", desc: "big left statement (Insurance Policy layout; null = default with accent highlights)" },
      { key: "ctaSubtitle", desc: "accent subtitle (Retainer CTA layout)" },
      { key: "ctaRetainerNote", desc: "credited-toward-total note under the retainer amount (Retainer CTA layout)" },
      { key: "ctaLine", desc: "bold call-to-action line (Retainer CTA layout)" },
      { key: "ctaThanks", desc: "closing thank-you line (Retainer CTA layout)" },
    ],
    items: {
      key: "benefits",
      fields: ["text"],
      titleField: "text",
      preserveFields: ["textFont", "textSize", "textBold", "textItalic", "textUnderline", "textColor", "textOutline"],
      max: 6,
      desc: "retainer benefit bullets, each {text (one tight line)} — shared by all layouts (Band 1 bullets / insurance bullets / CTA deliverables). Return the FULL array in the SAME ORDER unless asked to add or drop.",
    },
    styleFields: [
      { key: "accentColor", kind: "color", desc: "accent color" },
      { key: "headlineSize", kind: "size", desc: "headline size multiplier (0.5-4)" },
      { key: "insuranceStatementSize", kind: "size", desc: "Insurance statement text size (0.5-2)" },
      { key: "insuranceBulletSize", kind: "size", desc: "Insurance bullet text size (0.5-2)" },
      { key: "insuranceGraphicSize", kind: "size", desc: "Insurance shield/umbrella graphic size (0.5-2)" },
      { key: "ctaTextSize", kind: "size", desc: "Retainer CTA card text size (0.5-2)" },
    ],
    layouts: DESIGN_RETAINER_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: false,
  },

  closing: {
    // The final CTA slide. Contact info (email/phone/address) is FACTUAL —
    // it syncs from Company Settings — and is never AI-rewritten.
    headline: true,
    headlineDesc:
      "the closing headline (e.g. 'Securing Your Project Schedule', 'Ready to Transform Your Home?', 'Let's Build Something Extraordinary')",
    copyFields: [
      { key: "tagline", desc: "short slogan line under the headline (Dark Centered / Light Logo / Photo Card layouts)" },
      { key: "subheadline", desc: "supporting line under the tagline (Dark Centered / Light Logo layouts)" },
      { key: "ctaParagraph", desc: "call-to-action paragraph — sign the design contract close (Blueprint Split layout)" },
      { key: "contactBoxTitle", desc: "bold first line of the orange-topped contact box (Blueprint Split layout)" },
      { key: "validityNote", desc: "proposal validity fine print (e.g. 'This proposal is valid for 30 days.')" },
    ],
    styleFields: [
      { key: "accentColor", kind: "color", desc: "accent color" },
      { key: "backgroundColor", kind: "color", desc: "background color (Dark Centered layout)" },
      { key: "headlineSize", kind: "size", desc: "headline size multiplier (0.5-4)" },
      { key: "ctaParagraphSize", kind: "size", desc: "CTA paragraph size (Blueprint Split, 0.5-2)" },
      { key: "contactBoxTextSize", kind: "size", desc: "contact box text size (Blueprint Split, 0.5-2)" },
    ],
    layouts: CLOSING_SLIDE_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: false,
  },

  "floor-plan": {
    // Zone labels/descriptions are copy; sqft, pins, and highlight boxes are
    // MEASUREMENTS synced from the project — never AI-rewritten.
    headline: true,
    headlineDesc: "the slide title (e.g. 'Mapping the Project Footprint')",
    copyFields: [
      { key: "sectionLabel", desc: "small uppercase eyebrow label" },
      { key: "introText", desc: "one-line intro under the headline" },
      { key: "totalLabel", desc: "label on the total-footprint band" },
    ],
    items: {
      key: "zones",
      fields: ["label", "description"],
      titleField: "label",
      preserveFields: ["id", "number", "sqft", "pinX", "pinY", "side", "boxX", "boxY", "boxW", "boxH", "roomId"],
      max: 8,
      desc: "the renovation zones, each {label ('Zone N: Name'), description (one tight scope line)}. Return the FULL array in the SAME ORDER; never add or drop zones.",
    },
    styleFields: [
      { key: "accentColor", kind: "color", desc: "accent color" },
      { key: "highlightColor", kind: "color", desc: "zone highlight / pin color" },
      { key: "zoneTextSize", kind: "size", desc: "zone card text size (0.5-2)" },
    ],
    layouts: FLOOR_PLAN_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: false,
    supportsIcons: false,
  },

  craftsmanship: {
    headline: true,
    headlineDesc: "the slide title (e.g. 'Material & Assembly Standards' or 'Built to Last')",
    copyFields: [
      { key: "sectionLabel", desc: "small uppercase eyebrow label" },
      { key: "introText", desc: "one-line intro under the headline" },
      { key: "columnATitle", desc: "left standards column title (Standards Grid layout)" },
      { key: "columnBTitle", desc: "right standards column title (Standards Grid layout)" },
    ],
    items: {
      key: "items",
      fields: ["title", "description"],
      titleField: "title",
      preserveFields: ["id", "photoUrl", "pinX", "pinY", "side", "column"],
      max: 8,
      desc: "the craftsmanship standards, each {title, description (one sentence of concrete, verifiable build practice — no marketing fluff)}. Return the FULL array in the SAME ORDER unless asked to add or drop.",
    },
    styleFields: [
      { key: "accentColor", kind: "color", desc: "accent color" },
      { key: "itemTextSize", kind: "size", desc: "standards text size (0.5-2)" },
    ],
    layouts: CRAFTSMANSHIP_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: false,
  },

  "scope-breakdown": {
    // "Additional Areas Included" — the unrendered rooms. Title lives in content.title.
    headline: false,
    copyFields: [
      { key: "title", desc: "the slide title (e.g. 'Additional Areas Included')" },
      { key: "introText", desc: "1-2 sentence intro under the title" },
    ],
    items: {
      key: "rooms",
      fields: ["name", "description"],
      titleField: "name",
      preserveFields: ["id", "isIncluded"],
      supportsIconPng: true,
      illustrationField: "illustrationUrl",
      illustrationStyle: "isometric",
      max: 8,
      desc: "the rooms, each {name (room name), description (one tight sentence of scope)}. Return the FULL array in the SAME ORDER; don't add or drop rooms.",
    },
    styleFields: [{ key: "accentColor", kind: "color", desc: "accent color" }],
    layouts: SCOPE_BREAKDOWN_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: true,
  },

  "before-after": {
    // The displayed title is content.roomName; photos are chosen via the room +
    // render pickers (two images don't fit the single-photo swap), so no photoField.
    headline: false,
    copyFields: [
      { key: "roomName", desc: "the room/title shown at the top, e.g. 'Primary Bath'" },
      { key: "caption", desc: "one-line caption under the images" },
      { key: "transformationStat", desc: "short metric chip, e.g. '+168 SF' or 'ceilings 8′ → 18′'" },
      { key: "beforeLabel", desc: "the 'Before' label text" },
      { key: "afterLabel", desc: "the 'After' label text" },
    ],
    styleFields: [{ key: "accentColor", kind: "color", desc: "accent color" }],
    layouts: ["reveal-slider", "side-by-side", "after-emphasis", "cards", "offset", "diagonal"],
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: false,
  },

  cover: {
    // On the cover, subheadline is the BIG serif title; headline is a small label.
    headline: true,
    headlineDesc: "the SMALL uppercase project-name / address label (e.g. '13 TELFORD LANE' or 'Remodeling Proposal'). Keep it short.",
    subheadline: {
      desc: "the LARGE serif COVER TITLE — an evocative concept name for the project, NOT just the address. Spirit of 'Enhanced Livability for 94 Coggins Point', 'A Complete Reimagining', 'From Vision to Reality'. <= 7 words.",
    },
    copyFields: [
      { key: "tagline", desc: "short evocative tagline / supporting line (<= 8 words)" },
      { key: "preparedFor", desc: "the 'Prepared for' client name" },
      { key: "date", desc: "the date line" },
      { key: "address", desc: "project site address" },
    ],
    styleFields: [
      { key: "accentColor", kind: "color", desc: "accent color" },
      { key: "headlineSize", kind: "size", desc: "title size multiplier" },
      { key: "taglineSize", kind: "size", desc: "tagline size multiplier" },
    ],
    layouts: COVER_LAYOUTS.map((l) => l.key),
    layoutTarget: "slide",
    supportsBackground: true,
    supportsIcons: false,
    photoField: { key: "heroImageUrl", multiple: false },
  },

  objective: {
    headline: true,
    copyFields: [
      { key: "objective", desc: "short mission opener (<=28 words; wrap key phrases in **bold**)" },
      { key: "hubScene", desc: "visual description of the CENTER (hub) home illustration, e.g. 'two-gable coastal home with covered porch'" },
    ],
    iconKeyFields: ["hubIcon"],
    items: {
      key: "pillars",
      fields: ["title", "body", "icon", "scene"],
      iconField: "icon",
      supportsIconPng: false,
      max: 5,
      desc: "objective zones, each {title (2-4 words), body (one line), icon, scene (visual description of that zone's illustration)}",
    },
    styleFields: [
      { key: "headlineColor", kind: "color", desc: "headline color" },
      { key: "headlineSize", kind: "size", desc: "headline size multiplier" },
      { key: "hubSize", kind: "size", desc: "hub-spoke center size (0.6-1.6)" },
      { key: "zoneTextSize", kind: "size", desc: "hub-spoke zone text size (0.6-1.6)" },
      { key: "arrowWidth", kind: "size", desc: "hub-spoke arrow thickness (0.5-2.5)" },
      { key: "arrowLength", kind: "size", desc: "hub-spoke arrow length (0.3-0.9)" },
    ],
    layouts: ["hub-spoke", "pillars", "pillars-photo"],
    layoutTarget: "content",
    supportsBackground: true,
    supportsIcons: true,
    illustrations: {
      hubSceneKey: "hubScene",
      hubImageKey: "hubImageUrl",
      hubIconKey: "hubIcon",
      itemSceneField: "scene",
      itemImageField: "imageUrl",
    },
    // Photo for the "pillars-photo" layout (hero on the left).
    photoField: { key: "heroImageUrl", multiple: false },
  },
};

type IllustrationStyle = "scene" | "isometric";

/**
 * Generate one bespoke monochrome line-art illustration.
 *  - "scene"     — a framed line-art vignette (Objective hub/zones).
 *  - "isometric" — a 3D isometric architectural massing drawing, technical
 *                  blueprint style (Scope Breakdown blueprint layout).
 */
async function genIllustration(scene: string, label: string, style: IllustrationStyle = "scene"): Promise<string | null> {
  const visual = (scene || label).trim();
  if (!visual) return null;
  const prompt =
    style === "isometric"
      ? `A very SIMPLE, minimalist isometric line illustration of ${visual}, drawn with only a few clean thin white strokes. Iconographic and highly uncluttered with generous empty space; a single centered subject. No people, no text, no color, no shading, no fill, no ground texture, no background. Must be instantly legible at small size.`
      : `A detailed architectural line-art illustration of ${visual}. Confident, even-weight ink strokes; clean and uncluttered; depicts the full scene filling the frame`;
  const params = {
    name: label,
    visual: prompt,
    description: `Line-art illustration for a luxury remodeling proposal: ${visual}`,
    monochrome: true,
    mode: "illustration",
  } as const;
  // One retry — multi-image edits draw several illustrations back-to-back and
  // a single rate-limit blip used to silently drop the image.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1500);
    try {
      const gen = await generateBrandIconPngAction(params);
      if (!gen.error && gen.imageUrl) return gen.imageUrl;
    } catch {
      /* retry once, then fall back */
    }
  }
  return null;
}

// ─── Result type ──────────────────────────────────────────────────────────────

export type AiEditResult =
  | {
      ok: true;
      headline: string | null;
      subheadline: string | null;
      layoutKey: string | null;
      contentPatch: Record<string, unknown>;
      note: string | null;
    }
  | { ok: false; error: string };

type PlanShape = {
  headline?: unknown;
  subheadline?: unknown;
  content?: unknown;
  items?: unknown;
  layout?: unknown;
  background?: unknown;
  photoId?: unknown;
  regenerateIcons?: unknown;
  regenerateIllustrations?: unknown;
  note?: unknown;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function clampSize(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.3, Math.min(4, n));
}

/** Build the human-readable "editable surface" the planner is allowed to touch. */
function describeSurface(d: SlideEditDescriptor): string {
  const lines: string[] = [];
  if (d.headline) lines.push(`- "headline": ${d.headlineDesc ?? "the slide title"} (string)`);
  if (d.subheadline) lines.push(`- "subheadline": ${d.subheadline.desc} (string)`);
  for (const f of d.copyFields) lines.push(`- content."${f.key}": ${f.desc} (string)`);
  for (const s of d.styleFields) {
    if (s.kind === "color") lines.push(`- content."${s.key}": ${s.desc} (hex color like #1A2332)`);
    else if (s.kind === "size") lines.push(`- content."${s.key}": ${s.desc} (number)`);
    else if (s.kind === "boolean") lines.push(`- content."${s.key}": ${s.desc} (true/false)`);
    else lines.push(`- content."${s.key}": ${s.desc} (one of: ${(s.values ?? []).join(", ")})`);
  }
  for (const k of d.iconKeyFields ?? []) lines.push(`- content."${k}": an icon key (one of: ${SCOPE_ICON_KEY_LIST})`);
  if (d.items) lines.push(`- items: ${d.items.desc}. Return the FULL array you want (max ${d.items.max ?? 6}). icon must be one of: ${SCOPE_ICON_KEY_LIST}.`);
  lines.push(`- layout: one of ${d.layouts.join(", ")} (or null to keep)`);
  if (d.supportsBackground) lines.push('- background: a vivid image-generation prompt for a NEW slide background, or null. Only set when the user explicitly wants a background/imagery change.');
  if (d.photoField) lines.push('- photoId: the id of a project photo to use (from the list below), or null.');
  if (d.supportsIcons && d.items && d.items.supportsIconPng) lines.push('- regenerateIcons: true to (re)pick/generate a bespoke icon for each item, else false.');
  if (d.items?.illustrationField) lines.push('- regenerateIllustrations: true to draw a bespoke line-art illustration for each item (used by the blueprint layout), else false.');
  if (d.illustrations) lines.push('- regenerateIllustrations: one of "hub" | "zones" | "both" | "none". The CENTER home drawing is the "hub". Set "hub" (or "both") when the user wants to replace/redraw the center image; set "zones" to redraw the zone illustrations. When replacing the hub with something different, ALSO set content.hubScene to the new description.');
  return lines.join("\n");
}

/** Compact summary of the current slide so the model edits in context. */
function currentStateSummary(
  d: SlideEditDescriptor,
  headline: string | null,
  subheadline: string | null,
  content: Record<string, unknown>,
): string {
  const out: Record<string, unknown> = {};
  if (d.headline) out.headline = headline ?? "";
  if (d.subheadline) out.subheadline = subheadline ?? "";
  for (const f of d.copyFields) if (content[f.key] != null) out[f.key] = content[f.key];
  for (const k of d.iconKeyFields ?? []) if (content[k] != null) out[k] = content[k];
  for (const s of d.styleFields) if (content[s.key] != null) out[s.key] = content[s.key];
  if (d.items && Array.isArray(content[d.items.key])) out[d.items.key] = content[d.items.key];
  return JSON.stringify(out);
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export async function aiEditSlide(params: { slideId: string; prompt: string }): Promise<AiEditResult> {
  const instruction = params.prompt.trim();
  if (!instruction) return { ok: false, error: "Type what you'd like changed." };

  const slide = await prisma.deckSlide.findUnique({
    where: { id: params.slideId },
    select: { id: true, type: true, headline: true, subheadline: true, layoutKey: true, content: true, deck: { select: { projectId: true } } },
  });
  if (!slide) return { ok: false, error: "Slide not found." };

  const projectId = slide.deck?.projectId ?? null;
  const content = asObject(slide.content);
  const d: SlideEditDescriptor =
    DESCRIPTORS[slide.type] ?? {
      // Graceful fallback for slide types without a descriptor yet.
      headline: true,
      copyFields: [],
      styleFields: [],
      layouts: [],
      layoutTarget: "slide",
      supportsBackground: true,
      supportsIcons: false,
    };

  // Gather candidate photos when the slide supports a photo swap.
  let photoList: { id: string; url: string; thumbnailUrl: string | null; label: string }[] = [];
  if (d.photoField && projectId) {
    const media = await prisma.media.findMany({
      where: {
        projectId,
        OR: [{ type: "EXISTING" }, { type: "RENDERING", renderStatus: "DONE" }],
      },
      select: { id: true, url: true, thumbnailUrl: true, kind: true, caption: true },
      take: 40,
    });
    photoList = media
      .filter((m) => m.url)
      .map((m) => ({
        id: m.id,
        url: m.url as string,
        thumbnailUrl: m.thumbnailUrl ?? null,
        label: (m.caption || m.kind || "photo") as string,
      }));
  }

  const photoBlock =
    d.photoField && photoList.length > 0
      ? `\n\nAvailable project photos (id — label):\n${photoList.map((p) => `${p.id} — ${p.label}`).join("\n")}`
      : "";

  // The JSON plan shape must only advertise the regenerate keys this slide type
  // actually supports — a hard-coded regenerateIcons here made the model express
  // every icon request through it, and unsupported slides (e.g. Objective, whose
  // zone art is illustrations) silently dropped the change as "not applicable".
  const planShape = [
    '"headline":string|null',
    '"subheadline":string|null',
    '"content":{<field>:<value>}|null',
    '"items":[...]|null',
    '"layout":string|null',
    '"background":string|null',
    '"photoId":string|null',
    ...(d.supportsIcons && d.items?.supportsIconPng ? ['"regenerateIcons":boolean'] : []),
    ...(d.illustrations
      ? ['"regenerateIllustrations":"hub"|"zones"|"both"|"none"']
      : d.items?.illustrationField
        ? ['"regenerateIllustrations":boolean']
        : []),
    '"note":string',
  ].join(",");

  // ── Plan: one Claude call infers intent + returns a structured plan. ──────────
  const response = await callClaude({
    max_tokens: 1500,
    temperature: 0.5,
    system:
      "You are a slide designer for a LUXURY design-build remodeling firm, editing ONE slide of a client proposal deck. " +
      "Read the user's plain-language instruction and decide what to change. Be tasteful and specific to this project. " +
      "You may ONLY change the fields listed in the editable surface — omit anything you are not changing (use null / false). " +
      "CRITICAL — PRESERVE EXISTING COPY: do NOT rewrite, shorten, or re-summarize any existing text unless the user EXPLICITLY asks to change the wording. " +
      "If the request is about icons, illustrations, layout, colors, photos, or a background, you MUST set \"items\" to null and \"content\" text fields to null and leave ALL wording untouched — only set the relevant regenerate/layout/style fields. " +
      "Only return the \"items\" array (or text in \"content\") when the user clearly asked to edit the words. " +
      "When you DO rewrite, keep titles to 2-4 words and detail/body lines to one tight sentence. " +
      "Return ONLY minified JSON of this shape: " +
      `{${planShape}}. ` +
      "The note is <=14 words describing what you changed. No markdown, no code fences, JSON only.\n\n" +
      `EDITABLE SURFACE for this "${slide.type}" slide:\n${describeSurface(d)}`,
    messages: [
      {
        role: "user",
        content:
          `Current slide state:\n${currentStateSummary(d, slide.headline, slide.subheadline, content)}` +
          photoBlock +
          `\n\nInstruction: ${instruction}\n\nReturn the JSON plan now.`,
      },
    ],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");

  let plan: PlanShape;
  try {
    plan = JSON.parse(raw) as PlanShape;
  } catch {
    return { ok: false, error: "The AI response could not be read. Try rephrasing." };
  }

  // Copy-protection guard: when the instruction is clearly about art / layout /
  // color (and NOT about wording), discard any text rewrite the model returned
  // so existing copy is never silently overwritten by an icon/illustration request.
  {
    const lc = instruction.toLowerCase();
    const artWords = /(icon|illustrat|drawing|graphic|line[- ]?art|layout|colou?r|background|photo|blueprint|isometric|render)/.test(lc);
    const copyWords = /(rewrite|re-?word|shorten|tighten|expand|longer|concise|wording|copy|\btext\b|sentence|grammar|describe|description|headline|title|intro|caption|bullet|paragraph|name)/.test(lc);
    if (artWords && !copyWords) {
      plan.items = null;
      plan.headline = null;
      plan.subheadline = null;
      if (plan.content && typeof plan.content === "object" && !Array.isArray(plan.content)) {
        const pc = plan.content as Record<string, unknown>;
        for (const f of d.copyFields) delete pc[f.key];
      }
    }
  }

  // Users say "icons" for the zone art on illustration-driven slides (Objective).
  // When per-item PNG icons aren't supported but bespoke illustrations are,
  // honor a regenerateIcons request as a zones redraw instead of dropping it.
  if (
    d.illustrations &&
    !d.items?.supportsIconPng &&
    plan.regenerateIcons === true &&
    typeof plan.regenerateIllustrations !== "string"
  ) {
    plan.regenerateIllustrations = "zones";
  }

  const contentPatch: Record<string, unknown> = {};
  let headline: string | null = null;
  let subheadline: string | null = null;
  let layoutKey: string | null = null;

  // Headline + subheadline (top-level slide fields)
  if (d.headline && typeof plan.headline === "string" && plan.headline.trim()) {
    headline = plan.headline.trim();
  }
  if (d.subheadline && typeof plan.subheadline === "string" && plan.subheadline.trim()) {
    subheadline = plan.subheadline.trim();
  }

  // Copy + style fields (validated against the descriptor's allowlist).
  const planContent = asObject(plan.content);
  const copyKeys = new Set(d.copyFields.map((f) => f.key));
  const iconKeys = new Set(d.iconKeyFields ?? []);
  const styleByKey = new Map(d.styleFields.map((s) => [s.key, s] as const));
  for (const [key, value] of Object.entries(planContent)) {
    if (copyKeys.has(key)) {
      contentPatch[key] = typeof value === "string" ? (value.trim() || null) : value;
      continue;
    }
    if (iconKeys.has(key)) {
      if (isScopeIconKey(value)) contentPatch[key] = value;
      continue;
    }
    const sf = styleByKey.get(key);
    if (!sf) continue; // not editable — drop
    if (sf.kind === "color") {
      if (typeof value === "string" && value.trim()) contentPatch[key] = value.trim();
    } else if (sf.kind === "size") {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) contentPatch[key] = clampSize(n);
    } else if (sf.kind === "boolean") {
      contentPatch[key] = Boolean(value);
    } else if (sf.kind === "enum") {
      if (typeof value === "string" && (sf.values ?? []).includes(value)) contentPatch[key] = value;
    }
  }

  // Items (structured array)
  if (d.items && Array.isArray(plan.items)) {
    const spec = d.items;
    const titleField = spec.titleField ?? "title";
    // Existing items (by index) so we can carry over preserved fields (id, isIncluded…).
    const existingItems = Array.isArray(content[spec.key]) ? (content[spec.key] as unknown[]) : [];
    const cleaned = (plan.items as unknown[])
      .map((it, idx) => {
        const obj = asObject(it);
        const next: Record<string, unknown> = {};
        // Carry preserved fields from the existing item at the same index.
        const prev = asObject(existingItems[idx]);
        for (const pf of spec.preserveFields ?? []) {
          if (prev[pf] !== undefined) next[pf] = prev[pf];
        }
        for (const f of spec.fields) {
          if (f === spec.iconField) {
            next[f] = isScopeIconKey(obj[f]) ? obj[f] : "feature";
          } else if (typeof obj[f] === "string") {
            next[f] = (obj[f] as string).trim() || null;
          } else if (obj[f] != null) {
            next[f] = obj[f];
          }
        }
        return next;
      })
      .filter((it) => typeof it[titleField] === "string" && (it[titleField] as string).length > 0)
      .slice(0, spec.max ?? 6);
    if (cleaned.length > 0) contentPatch[spec.key] = cleaned;
  }

  // Layout
  if (typeof plan.layout === "string" && d.layouts.includes(plan.layout)) {
    if (d.layoutTarget === "content") contentPatch.layout = plan.layout;
    else layoutKey = plan.layout;
  }

  // Icons — (re)resolve AI PNGs for item titles when requested + supported.
  if (
    d.items?.supportsIconPng &&
    plan.regenerateIcons === true &&
    Array.isArray(contentPatch[d.items.key] ?? content[d.items.key])
  ) {
    const tf = d.items.titleField ?? "title";
    const items = (contentPatch[d.items.key] ?? content[d.items.key]) as Record<string, unknown>[];
    const titles = items.map((it) => String(it[tf] ?? ""));
    try {
      const imageMap = d.items.iconStyle === "duotone"
        ? await resolveDuotoneIconImages(titles, { generateMissing: true })
        : await resolveScopeIconImages(titles, { generateMissing: true });
      contentPatch[d.items.key] = items.map((it) => {
        const url = imageMap.get(scopeIconSlug(String(it[tf] ?? "")));
        return url ? { ...it, iconImageUrl: url } : it;
      });
    } catch {
      /* non-fatal: keep vector icons */
    }
  }

  // When an illustration redraw was requested but every image failed to draw,
  // say so instead of falling through to "no applicable change".
  let illustrationFailed = false;

  // Per-item line-art illustrations — draw a bespoke illustration per item into
  // the configured field (e.g. scope-breakdown rooms → blueprint layout).
  if (
    d.items?.illustrationField &&
    plan.regenerateIllustrations != null &&
    plan.regenerateIllustrations !== false &&
    plan.regenerateIllustrations !== "none" &&
    Array.isArray(contentPatch[d.items.key] ?? content[d.items.key])
  ) {
    const tf = d.items.titleField ?? "title";
    const illF = d.items.illustrationField;
    const style = d.items.illustrationStyle ?? "scene";
    const items = (contentPatch[d.items.key] ?? content[d.items.key]) as Record<string, unknown>[];
    const drawn = await mapWithConcurrency(items, 2, async (it) => {
      const name = String(it[tf] ?? "");
      if (!name) return it;
      // Isometric icons read best from a SHORT subject; the full description
      // makes them cluttered. Scene-style keeps a little context.
      const desc = String(it.description ?? it.body ?? "");
      const subject = style === "isometric" ? name : (desc ? `${name}: ${desc}` : name);
      const url = await genIllustration(subject, name, style);
      return url ? { ...it, [illF]: url } : it;
    });
    if (drawn.some((it, i) => it !== items[i])) contentPatch[d.items.key] = drawn;
    else if (items.some((it) => String(it[tf] ?? "").trim())) illustrationFailed = true;
  }

  // Illustrations — (re)draw the bespoke hub + zone line-art (Objective).
  if (d.illustrations && typeof plan.regenerateIllustrations === "string" && plan.regenerateIllustrations !== "none") {
    const ill = d.illustrations;
    const which = plan.regenerateIllustrations;
    const doHub = which === "hub" || which === "both";
    const doZones = which === "zones" || which === "both";

    if (doHub) {
      const scene = String(contentPatch[ill.hubSceneKey] ?? content[ill.hubSceneKey] ?? "").trim() || "the existing home, architectural exterior";
      const url = await genIllustration(scene, "the home");
      if (url) contentPatch[ill.hubImageKey] = url;
      else illustrationFailed = true;
    }

    if (doZones && d.items) {
      const items = (contentPatch[d.items.key] ?? content[d.items.key]) as Record<string, unknown>[] | undefined;
      if (Array.isArray(items)) {
        const drawn = await mapWithConcurrency(items, 2, async (it) => {
          const scene = String(it[ill.itemSceneField] ?? "").trim();
          const title = String(it.title ?? "zone");
          if (!scene) return it;
          const url = await genIllustration(scene, title);
          return url ? { ...it, [ill.itemImageField]: url } : it;
        });
        if (drawn.some((it, i) => it !== items[i])) contentPatch[d.items.key] = drawn;
        else if (items.some((it) => String(it[ill.itemSceneField] ?? "").trim())) illustrationFailed = true;
      }
    }
  }

  // Background — generate a new image via Imagen and store it on the slide.
  if (d.supportsBackground && typeof plan.background === "string" && plan.background.trim() && projectId) {
    try {
      const gen = await generateSlideBackground(plan.background.trim());
      const ext = gen.mimeType.includes("jpeg") || gen.mimeType.includes("jpg") ? "jpg" : gen.mimeType.includes("webp") ? "webp" : "png";
      const fileKey = `deck-backgrounds/${projectId}/${slide.id}/${Date.now()}.${ext}`;
      const up = await uploadBuffer(fileKey, gen.bytes, gen.mimeType);
      if (up.publicUrl) contentPatch.aiBackground = up.publicUrl;
    } catch (e) {
      return { ok: false, error: `Background generation failed: ${e instanceof Error ? e.message : "unknown"}` };
    }
  }

  // Photo swap — set the descriptor's photo field from the chosen library photo.
  if (d.photoField && typeof plan.photoId === "string") {
    const pick = photoList.find((p) => p.id === plan.photoId);
    if (pick) {
      if (d.photoField.key === "heroImageUrl") contentPatch.heroImageUrl = pick.url;
      else contentPatch.selectedPhotos = [{ id: pick.id, url: pick.url, thumbnailUrl: pick.thumbnailUrl }];
    }
  }

  if (headline === null && subheadline === null && layoutKey === null && Object.keys(contentPatch).length === 0) {
    return {
      ok: false,
      error: illustrationFailed
        ? "Image generation failed — please try again in a moment."
        : "The AI didn't return an applicable change. Try being more specific.",
    };
  }

  return {
    ok: true,
    headline,
    subheadline,
    layoutKey,
    contentPatch,
    note: typeof plan.note === "string" ? plan.note.trim() || null : null,
  };
}

/** Slide types that currently have a full capability descriptor. */
export function hasAiEditDescriptor(type: string): boolean {
  return type in DESCRIPTORS;
}
