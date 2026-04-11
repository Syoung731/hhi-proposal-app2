import type { DeckBranding } from "./types";

const DEFAULT_ACCENT = "#E87722";
const DEFAULT_TEXT = "#18181B";

/**
 * Adapts the CompanySettings row (or subset) into a DeckBranding shape.
 * This is the single source of truth for branding inside the deck system.
 * The input type matches CompanySettings from Prisma (or the UI type).
 */
export function adaptBrandingForDeck(
  settings: {
    logoLightUrl?: string | null;
    logoDarkUrl?: string | null;
    primaryColorHex?: string | null;
    textColorHex?: string | null;
    companyName?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null
): DeckBranding {
  const street = [settings?.addressLine1, settings?.addressLine2]
    .filter(Boolean)
    .join(", ");
  const parts = [
    street || null,
    settings?.city,
    [settings?.state, settings?.zip].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return {
    logoLightUrl: settings?.logoLightUrl ?? null,
    logoDarkUrl: settings?.logoDarkUrl ?? null,
    accentColor: settings?.primaryColorHex ?? DEFAULT_ACCENT,
    textColor: settings?.textColorHex ?? DEFAULT_TEXT,
    companyName: settings?.companyName ?? "HHI Builders",
    address: parts || null,
    phone: settings?.phone ?? null,
    email: settings?.email ?? null,
  };
}
