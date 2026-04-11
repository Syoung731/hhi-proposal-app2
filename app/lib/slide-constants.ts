// ─── Slide Design Tokens ────────────────────────────────────────────────────
// Shared constants for consistent slide styling across all 18 slide types.
// Phase 1: define constants. Phase 2: apply to slides.

/** Standard padding tiers for slide content areas. */
export const SLIDE_PADDING = {
  content: "5% 6%", // standard content slides
  centered: "6% 10%", // CTA and centered-layout slides
  photo: "3% 4%", // photo-heavy slides
} as const;

/** Standard card shadow presets. */
export const CARD_SHADOWS = {
  subtle: "0 1px 4px rgba(0,0,0,0.06)",
  normal: "0 2px 8px rgba(0,0,0,0.08)",
  elevated: "0 4px 16px rgba(0,0,0,0.12)",
} as const;

/** Standardized section label font size (was 0.5em–0.6em across slides). */
export const SECTION_LABEL_SIZE = "0.55em" as const;

/** Standard TitleAccentRule widths. */
export const ACCENT_RULE_WIDTH = {
  standard: "3em",
  narrow: "2.5em", // for slides with narrow text containers
} as const;

// ─── Phase 3 Constants ──────────────────────────────────────────────────────

/** Headline size scale multipliers. */
export const HEADLINE_SCALE = {
  small: 0.8,
  medium: 1.0,
  large: 1.2,
  display: 1.5,
} as const;

/** Body text size scale multipliers. */
export const BODY_SCALE = {
  small: 0.85,
  medium: 1.0,
  large: 1.15,
} as const;

/** Line spacing (line-height) values. */
export const LINE_SPACING = {
  tight: 1.3,
  normal: 1.6,
  relaxed: 1.9,
} as const;

/** Card padding based on spacing density. */
export const CARD_PADDING = {
  compact: 12,
  normal: 20,
  spacious: 28,
} as const;

/** Card border styles. Accent color must be passed at render time. */
export const CARD_BORDER = {
  none: "none",
  subtle: "1px solid rgba(0,0,0,0.08)",
  // accent: dynamically computed as `borderLeft: 2px solid ${resolvedAccent}`
} as const;

/** Standard default logo positions per slide category. */
export const LOGO_POSITION_DEFAULTS = {
  cover: { x: 5, y: 5 },
  closing: { x: 50, y: 50 }, // ignored — centered mode
  cta: { x: 50, y: 88 },
  content: { x: 85, y: 88 },
} as const;

/** Curated font families for slide headline/body font selectors. */
export const SLIDE_FONTS = {
  headline: [
    { label: "Classic Serif",  value: "Cormorant Garamond, serif" },
    { label: "Refined Serif",  value: "Playfair Display, serif" },
    { label: "Editorial Bold", value: "DM Serif Display, serif" },
    { label: "Architectural",  value: "Libre Baskerville, serif" },
    { label: "Warm Humanist",  value: "Lora, serif" },
    { label: "Luxury Minimal", value: "Raleway, sans-serif" },
    { label: "Clean Sans",     value: "Jost, sans-serif" },
    { label: "Modern Sans",    value: "Inter, sans-serif" },
    { label: "Geometric",      value: "Geist Sans, sans-serif" },
    { label: "Monospace",      value: "Geist Mono, monospace" },
  ],
  body: [
    { label: "Clean Sans",     value: "Jost, sans-serif" },
    { label: "Modern Sans",    value: "Inter, sans-serif" },
    { label: "Warm Humanist",  value: "Lora, serif" },
    { label: "Luxury Minimal", value: "Raleway, sans-serif" },
    { label: "Classic Serif",  value: "Cormorant Garamond, serif" },
    { label: "Refined Serif",  value: "Playfair Display, serif" },
    { label: "Architectural",  value: "Libre Baskerville, serif" },
    { label: "Editorial Bold", value: "DM Serif Display, serif" },
    { label: "Geometric",      value: "Geist Sans, sans-serif" },
    { label: "Monospace",      value: "Geist Mono, monospace" },
  ],
  defaults: {
    headline: "Cormorant Garamond, serif",
    body: "Jost, sans-serif",
    label: "Jost, sans-serif", // section labels — not configurable
  },
} as const;
