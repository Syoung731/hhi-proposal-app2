/**
 * Deck theme tokens — the contract every slide consumes so it renders correctly
 * in either visual skin (see docs/deck-system.md §4–5). Plain module (no JSX, no
 * "use client") so it can be imported from server and client alike. The React
 * context + hook live in ./theme-context.tsx.
 *
 * Fonts are CSS-variable references (declared in app/layout.tsx), matching the
 * SLIDE_FONTS convention — a literal family name would silently fall back.
 */

export type DeckThemeKey = "blueprint" | "editorial" | "gallery" | "coastal" | "palmetto";

export interface DeckTheme {
  key: DeckThemeKey;
  label: string;
  fonts: {
    headline: string;
    body: string;
    label: string;
    /** Big decorative numerals (serif on editorial, sans on blueprint). */
    numeral: string;
  };
  color: {
    ink: string; // primary text on a light surface
    muted: string; // secondary text on a light surface
    accent: string; // the single accent (orange)
    accentSoft: string; // accent at low alpha — chips, fills, soft backgrounds
    surface: string; // slide background base
    panel: string; // dark / alternate panel background
    panelInk: string; // primary text on the dark panel
    panelMuted: string; // secondary text on the dark panel
    line: string; // dividers / grid lines on light surfaces
  };
  surface: {
    /** Default page background treatment for blank slides. */
    page: "linen" | "white";
    /** Whether the graph-paper grid underlay is on by default. */
    grid: boolean;
  };
  title: {
    /** Orange underline accent rule beneath titles (editorial house style). */
    underlineRule: boolean;
    transform: "none" | "uppercase";
  };
  numeralStyle: "serif" | "sans";
}

const ORANGE = "#F47216";

export const BLUEPRINT_THEME: DeckTheme = {
  key: "blueprint",
  label: "Blueprint",
  fonts: {
    headline: "var(--font-jost), sans-serif",
    body: "var(--font-jost), sans-serif",
    label: "var(--font-jost), sans-serif",
    numeral: "var(--font-jost), sans-serif",
  },
  color: {
    ink: "#1A2332",
    muted: "#4B5563",
    accent: ORANGE,
    accentSoft: "rgba(244,114,22,0.10)",
    surface: "#FFFFFF",
    panel: "#27323B",
    panelInk: "#FFFFFF",
    panelMuted: "rgba(255,255,255,0.74)",
    line: "#E5E3DF",
  },
  surface: { page: "white", grid: true },
  title: { underlineRule: false, transform: "none" },
  numeralStyle: "sans",
};

export const EDITORIAL_THEME: DeckTheme = {
  key: "editorial",
  label: "Editorial",
  fonts: {
    headline: "var(--font-cormorant), serif",
    body: "var(--font-jost), sans-serif",
    label: "var(--font-jost), sans-serif",
    numeral: "var(--font-cormorant), serif",
  },
  color: {
    ink: "#1A2332",
    muted: "#4A5568",
    accent: ORANGE,
    accentSoft: "rgba(244,114,22,0.10)",
    surface: "#FAF7F1",
    panel: "#1B2A4A",
    panelInk: "#FFFFFF",
    panelMuted: "rgba(255,255,255,0.78)",
    line: "#E5E3DF",
  },
  surface: { page: "linen", grid: false },
  title: { underlineRule: true, transform: "none" },
  numeralStyle: "serif",
};

/** Gallery — bright white modern luxury. Pure white surface, high-contrast
 *  Playfair headlines, charcoal-black panel, hairline rules. */
export const GALLERY_THEME: DeckTheme = {
  key: "gallery",
  label: "Gallery",
  fonts: {
    headline: "var(--font-playfair), serif",
    body: "var(--font-inter), sans-serif",
    label: "var(--font-inter), sans-serif",
    numeral: "var(--font-playfair), serif",
  },
  color: {
    ink: "#16181D",
    muted: "#5C636E",
    accent: ORANGE,
    accentSoft: "rgba(244,114,22,0.08)",
    surface: "#FFFFFF",
    panel: "#14171C",
    panelInk: "#FFFFFF",
    panelMuted: "rgba(255,255,255,0.72)",
    line: "#ECECEA",
  },
  surface: { page: "white", grid: false },
  title: { underlineRule: true, transform: "none" },
  numeralStyle: "serif",
};

/** Coastal — Lowcountry sea-mist. Cool tinted surface, warm Lora serif,
 *  deep tidewater panel. The brand orange reads coastal-coral here. */
export const COASTAL_THEME: DeckTheme = {
  key: "coastal",
  label: "Coastal",
  fonts: {
    headline: "var(--font-lora), serif",
    body: "var(--font-jost), sans-serif",
    label: "var(--font-jost), sans-serif",
    numeral: "var(--font-lora), serif",
  },
  color: {
    ink: "#1C3239",
    muted: "#51686B",
    accent: ORANGE,
    accentSoft: "rgba(244,114,22,0.10)",
    surface: "#F4F8F7",
    panel: "#1E3B41",
    panelInk: "#F2F7F5",
    panelMuted: "rgba(242,247,245,0.76)",
    line: "#DCE6E3",
  },
  surface: { page: "white", grid: false },
  title: { underlineRule: true, transform: "none" },
  numeralStyle: "serif",
};

/** Palmetto — cream paper with a deep Lowcountry-green panel and engraved
 *  DM Serif display headlines. The only non-navy-family panel in the set. */
export const PALMETTO_THEME: DeckTheme = {
  key: "palmetto",
  label: "Palmetto",
  fonts: {
    headline: "var(--font-dm-serif), serif",
    body: "var(--font-jost), sans-serif",
    label: "var(--font-jost), sans-serif",
    numeral: "var(--font-dm-serif), serif",
  },
  color: {
    ink: "#1B2B25",
    muted: "#4E5F58",
    accent: ORANGE,
    accentSoft: "rgba(244,114,22,0.10)",
    surface: "#FBFAF5",
    panel: "#1E3A30",
    panelInk: "#F2EFE6",
    panelMuted: "rgba(242,239,230,0.76)",
    line: "#E5E1D4",
  },
  surface: { page: "linen", grid: false },
  title: { underlineRule: true, transform: "none" },
  numeralStyle: "serif",
};

export const DECK_THEMES: DeckTheme[] = [
  BLUEPRINT_THEME,
  EDITORIAL_THEME,
  GALLERY_THEME,
  COASTAL_THEME,
  PALMETTO_THEME,
];

export const DEFAULT_DECK_THEME: DeckThemeKey = "blueprint";

export function isDeckThemeKey(v: unknown): v is DeckThemeKey {
  return DECK_THEMES.some((t) => t.key === v);
}

/** Resolve a (possibly null/unknown) theme key to a full DeckTheme. */
export function resolveDeckTheme(key: unknown): DeckTheme {
  return DECK_THEMES.find((t) => t.key === key) ?? BLUEPRINT_THEME;
}
