"use client";

import type { CSSProperties } from "react";
import { type ScopeIconKey, isScopeIconKey } from "@/app/lib/deck/scope-icon-keys";

/**
 * Curated line-art icon set for scope slides (and any slide that maps a scope
 * line to a glyph). No external icon dependency — these are hand-rolled 24×24
 * stroke SVGs that inherit `color` via currentColor, so they tint to any accent.
 *
 * Keys + labels live in app/lib/deck/scope-icon-keys.ts (a plain module so the
 * server-side composer can import them too). This file owns the SVG path data
 * and the <ScopeIcon> renderer only.
 */

// Re-export the key list helpers so existing importers of this module keep working.
export {
  type ScopeIconKey,
  SCOPE_ICON_OPTIONS,
  SCOPE_ICON_KEYS,
  SCOPE_ICON_KEY_LIST,
  isScopeIconKey,
} from "@/app/lib/deck/scope-icon-keys";

// ── Path data ─────────────────────────────────────────────────────────────────
// Each entry returns the inner SVG elements for a 24×24 viewBox. Stroke styling
// (color, width, linecap) is applied by the wrapper.

const PATHS: Record<ScopeIconKey, React.ReactNode> = {
  feature: (
    <>
      <path d="M12 3l2.2 5.6L20 10l-4.5 3.7L17 20l-5-3.2L7 20l1.5-6.3L4 10l5.8-1.4z" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10c0-3 .5-6-1.5-6S7 7 12 10zM14 12c3 0 6 .5 6-1.5S17 9 14 12zM12 14c0 3-.5 6 1.5 6S17 17 12 14zM10 12c-3 0-6-.5-6 1.5S7 15 10 12z" />
    </>
  ),
  door: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <circle cx="15" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  "sliding-door": (
    <>
      <rect x="3" y="3" width="8" height="18" rx="0.5" />
      <rect x="13" y="3" width="8" height="18" rx="0.5" />
      <line x1="9" y1="12" x2="9" y2="13.5" />
      <line x1="15" y1="12" x2="15" y2="13.5" />
    </>
  ),
  window: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </>
  ),
  skylight: (
    <>
      <path d="M4 14l8-8 8 8" />
      <rect x="8" y="10" width="8" height="8" rx="0.5" transform="rotate(0 12 14)" />
      <line x1="12" y1="10" x2="12" y2="18" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="1" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="17" x2="12" y2="20" />
    </>
  ),
  lighting: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0 0 12 3z" />
    </>
  ),
  "recessed-light": (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  roof: (
    <>
      <path d="M3 12l9-7 9 7" />
      <path d="M6 11v8h12v-8" />
    </>
  ),
  house: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v10h12V10" />
      <rect x="10" y="14" width="4" height="6" />
    </>
  ),
  deck: (
    <>
      <line x1="3" y1="8" x2="21" y2="8" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="16" x2="21" y2="16" />
      <line x1="6" y1="8" x2="6" y2="20" />
      <line x1="18" y1="8" x2="18" y2="20" />
    </>
  ),
  fence: (
    <>
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="3" y1="14" x2="21" y2="14" />
      <line x1="7" y1="6" x2="7" y2="20" />
      <line x1="12" y1="6" x2="12" y2="20" />
      <line x1="17" y1="6" x2="17" y2="20" />
    </>
  ),
  pool: (
    <>
      <path d="M3 16c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5" />
      <path d="M3 20c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5" />
      <path d="M8 12V5a2 2 0 0 1 4 0v1" />
    </>
  ),
  grill: (
    <>
      <path d="M5 8h14l-1.5 6a4 4 0 0 1-4 3h-3a4 4 0 0 1-4-3z" />
      <line x1="8" y1="17" x2="7" y2="21" />
      <line x1="16" y1="17" x2="17" y2="21" />
      <line x1="9" y1="5" x2="9" y2="8" />
      <line x1="13" y1="5" x2="13" y2="8" />
    </>
  ),
  fireplace: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <rect x="8" y="9" width="8" height="9" />
      <path d="M12 16c1.2-1 1.2-2.2.5-3 .8.2 1.5 1 1.5 2a2 2 0 1 1-3.5-1.3c0 .9.5 1.5 1.5 2.3z" />
    </>
  ),
  stairs: (
    <>
      <path d="M4 20v-3h4v-3h4v-3h4V8h4" />
    </>
  ),
  shower: (
    <>
      <path d="M6 12V7a3 3 0 0 1 6 0" />
      <path d="M12 7h2a4 4 0 0 1 4 4" />
      <line x1="9" y1="16" x2="9" y2="18" />
      <line x1="12" y1="16" x2="12" y2="19" />
      <line x1="15" y1="16" x2="15" y2="18" />
    </>
  ),
  bathtub: (
    <>
      <path d="M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" />
      <path d="M6 12V6a2 2 0 0 1 2-2h1" />
      <line x1="7" y1="19" x2="6" y2="21" />
      <line x1="17" y1="19" x2="18" y2="21" />
    </>
  ),
  vanity: (
    <>
      <path d="M8 10a4 4 0 0 1 8 0" />
      <line x1="12" y1="4" x2="12" y2="6" />
      <ellipse cx="12" cy="10" rx="4" ry="1.5" />
      <path d="M6 14h12v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
    </>
  ),
  faucet: (
    <>
      <path d="M4 14v-2h6v2" />
      <path d="M10 12V9h4a3 3 0 0 1 3 3v1" />
      <line x1="17" y1="13" x2="17" y2="15" />
      <line x1="6" y1="14" x2="8" y2="14" />
      <line x1="7" y1="14" x2="7" y2="20" />
    </>
  ),
  toilet: (
    <>
      <path d="M6 4h3v5H6z" />
      <path d="M5 9h11v2a5 5 0 0 1-5 5H9z" />
      <line x1="9" y1="16" x2="9" y2="20" />
      <line x1="6" y1="20" x2="12" y2="20" />
    </>
  ),
  kitchen: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <line x1="3" y1="11" x2="21" y2="11" />
      <circle cx="7.5" cy="7.5" r="1" />
      <circle cx="11.5" cy="7.5" r="1" />
      <line x1="7" y1="15" x2="7" y2="17" />
      <line x1="12" y1="15" x2="12" y2="17" />
    </>
  ),
  cabinet: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="10" y1="11" x2="10.5" y2="11" />
      <line x1="14" y1="11" x2="13.5" y2="11" />
    </>
  ),
  counter: (
    <>
      <path d="M3 9h18v2H3z" />
      <line x1="5" y1="11" x2="5" y2="20" />
      <line x1="19" y1="11" x2="19" y2="20" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </>
  ),
  appliance: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <line x1="6" y1="8" x2="18" y2="8" />
      <line x1="14" y1="5.5" x2="16" y2="5.5" />
      <circle cx="12" cy="14" r="3" />
    </>
  ),
  flooring: (
    <>
      <rect x="3" y="4" width="8" height="6" />
      <rect x="13" y="4" width="8" height="6" />
      <rect x="3" y="14" width="8" height="6" />
      <rect x="13" y="14" width="8" height="6" />
    </>
  ),
  tile: (
    <>
      <path d="M3 7l4-4 4 4-4 4z" />
      <path d="M13 7l4-4 4 4-4 4z" />
      <path d="M8 17l4-4 4 4-4 4z" />
    </>
  ),
  paint: (
    <>
      <rect x="4" y="3" width="13" height="6" rx="1" />
      <path d="M17 6h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-6" />
      <path d="M12 11v3a1 1 0 0 1-1 1h-1v6h2v-6" />
    </>
  ),
  hvac: (
    <>
      <rect x="3" y="5" width="18" height="9" rx="1" />
      <line x1="6" y1="8" x2="18" y2="8" />
      <line x1="6" y1="11" x2="18" y2="11" />
      <path d="M7 18c0-1.5 2-1.5 2-3M12 18c0-1.5 2-1.5 2-3" />
    </>
  ),
  electrical: (
    <>
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </>
  ),
  plumbing: (
    <>
      <path d="M6 4v6a4 4 0 0 0 4 4h2a3 3 0 0 1 3 3v3" />
      <rect x="4" y="2" width="4" height="3" />
      <rect x="13" y="19" width="6" height="3" />
    </>
  ),
  storage: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="14" x2="20" y2="14" />
      <line x1="11" y1="6.5" x2="13" y2="6.5" />
      <line x1="11" y1="11.5" x2="13" y2="11.5" />
      <line x1="11" y1="16.5" x2="13" y2="16.5" />
    </>
  ),
  structure: (
    <>
      <path d="M3 21V7l9-4 9 4v14" />
      <path d="M3 7l9 5 9-5" />
      <line x1="12" y1="12" x2="12" y2="21" />
    </>
  ),
  "window-treatment": (
    <>
      <line x1="3" y1="4" x2="21" y2="4" />
      <path d="M5 4v8c0 2 2 2 2 4M9 4v8c0 2-2 2-2 4M13 4v8c0 2 2 2 2 4M17 4v8c0 2-2 2-2 4" />
    </>
  ),
  ruler: (
    <>
      <rect x="2" y="8" width="20" height="8" rx="1" transform="rotate(0 12 12)" />
      <line x1="6" y1="8" x2="6" y2="12" />
      <line x1="10" y1="8" x2="10" y2="12" />
      <line x1="14" y1="8" x2="14" y2="12" />
      <line x1="18" y1="8" x2="18" y2="12" />
    </>
  ),
};

interface ScopeIconProps {
  name?: string | null;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function ScopeIcon({ name, size = 28, color = "currentColor", strokeWidth = 1.6, style }: ScopeIconProps) {
  const key: ScopeIconKey = isScopeIconKey(name) ? name : "feature";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={style}
    >
      {PATHS[key]}
    </svg>
  );
}
