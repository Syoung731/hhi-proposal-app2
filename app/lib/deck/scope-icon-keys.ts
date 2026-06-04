/**
 * Canonical scope-icon key list — plain module (no "use client", no JSX) so it
 * can be imported from BOTH server code (the AI composer) and client code (the
 * ScopeIcons renderer + inspector dropdown) without crossing a client boundary.
 *
 * The actual SVG path data + <ScopeIcon> renderer live in
 * app/admin/projects/[id]/deck/slides/shared/ScopeIcons.tsx, which imports
 * these keys. Keep the two in sync — every key here must have a path there.
 */

export type ScopeIconKey =
  | "feature"
  | "fan"
  | "door"
  | "sliding-door"
  | "window"
  | "skylight"
  | "tv"
  | "lighting"
  | "recessed-light"
  | "roof"
  | "house"
  | "deck"
  | "fence"
  | "pool"
  | "grill"
  | "fireplace"
  | "stairs"
  | "shower"
  | "bathtub"
  | "vanity"
  | "faucet"
  | "toilet"
  | "kitchen"
  | "cabinet"
  | "counter"
  | "appliance"
  | "flooring"
  | "tile"
  | "paint"
  | "hvac"
  | "electrical"
  | "plumbing"
  | "storage"
  | "structure"
  | "window-treatment"
  | "ruler";

/** Human labels for the inspector dropdown (also defines display order). */
export const SCOPE_ICON_OPTIONS: { key: ScopeIconKey; label: string }[] = [
  { key: "feature", label: "Feature (default)" },
  { key: "fan", label: "Ceiling Fan" },
  { key: "door", label: "Door" },
  { key: "sliding-door", label: "Sliding Door" },
  { key: "window", label: "Window" },
  { key: "skylight", label: "Skylight" },
  { key: "tv", label: "TV / Media" },
  { key: "lighting", label: "Lighting" },
  { key: "recessed-light", label: "Recessed Light" },
  { key: "roof", label: "Roof" },
  { key: "house", label: "House / Structure" },
  { key: "deck", label: "Deck / Porch" },
  { key: "fence", label: "Fence / Railing" },
  { key: "pool", label: "Pool" },
  { key: "grill", label: "Grill / Outdoor Kitchen" },
  { key: "fireplace", label: "Fireplace" },
  { key: "stairs", label: "Stairs" },
  { key: "shower", label: "Shower" },
  { key: "bathtub", label: "Bathtub" },
  { key: "vanity", label: "Vanity / Sink" },
  { key: "faucet", label: "Faucet / Fixtures" },
  { key: "toilet", label: "Toilet" },
  { key: "kitchen", label: "Kitchen" },
  { key: "cabinet", label: "Cabinetry" },
  { key: "counter", label: "Countertop" },
  { key: "appliance", label: "Appliance" },
  { key: "flooring", label: "Flooring" },
  { key: "tile", label: "Tile" },
  { key: "paint", label: "Paint / Finishes" },
  { key: "hvac", label: "HVAC / Climate" },
  { key: "electrical", label: "Electrical" },
  { key: "plumbing", label: "Plumbing" },
  { key: "storage", label: "Storage" },
  { key: "structure", label: "Framing / Structural" },
  { key: "window-treatment", label: "Window Treatment" },
  { key: "ruler", label: "Dimensions" },
];

export const SCOPE_ICON_KEYS: ScopeIconKey[] = SCOPE_ICON_OPTIONS.map((o) => o.key);

/** Comma-separated key list for the composer's system prompt. */
export const SCOPE_ICON_KEY_LIST = SCOPE_ICON_KEYS.join(", ");

export function isScopeIconKey(v: unknown): v is ScopeIconKey {
  return typeof v === "string" && (SCOPE_ICON_KEYS as string[]).includes(v);
}
