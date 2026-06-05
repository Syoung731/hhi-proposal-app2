/**
 * Deck theme tokens — the contract every slide consumes so it renders correctly
 * in either visual skin (see docs/deck-system.md §4–5). Plain module (no JSX, no
 * "use client") so it can be imported from server and client alike. The React
 * context + hook live in ./theme-context.tsx.
 *
 * Fonts are CSS-variable references (declared in app/layout.tsx), matching the
 * SLIDE_FONTS convention — a literal family name would silently fall back.
 */

export type DeckThemeKey = "blueprint" | "editorial";

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

export const DECK_THEMES: DeckTheme[] = [BLUEPRINT_THEME, EDITORIAL_THEME];

export const DEFAULT_DECK_THEME: DeckThemeKey = "blueprint";

export function isDeckThemeKey(v: unknown): v is DeckThemeKey {
  return v === "blueprint" || v === "editorial";
}

/** Resolve a (possibly null/unknown) theme key to a full DeckTheme. */
export function resolveDeckTheme(key: unknown): DeckTheme {
  return key === "editorial" ? EDITORIAL_THEME : BLUEPRINT_THEME;
}
