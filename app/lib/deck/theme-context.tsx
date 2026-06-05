"use client";

import { createContext, useContext } from "react";
import { BLUEPRINT_THEME, type DeckTheme } from "./themes";

/**
 * Deck theme delivered via context so slide components can read it with
 * `useDeckTheme()` instead of threading a prop through every layer. Provided
 * once in SlideRenderer (the single chokepoint for editor + present + PDF).
 * Defaults to the Blueprint theme when no provider is present.
 */
const DeckThemeContext = createContext<DeckTheme>(BLUEPRINT_THEME);

export function DeckThemeProvider({
  theme,
  children,
}: {
  theme: DeckTheme;
  children: React.ReactNode;
}) {
  return <DeckThemeContext.Provider value={theme}>{children}</DeckThemeContext.Provider>;
}

export function useDeckTheme(): DeckTheme {
  return useContext(DeckThemeContext);
}
