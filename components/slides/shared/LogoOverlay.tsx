"use client";

import type { DeckBranding } from "@/app/lib/deck/types";

export interface LogoOverlayProps {
  show: boolean;
  variant: "light" | "dark";
  branding: DeckBranding;
  /** Horizontal position 0–100 (% from left). */
  xPercent: number;
  /** Vertical position 0–100 (% from top). */
  yPercent: number;
  /** Size multiplier 0.5–4.0 where 1.0 = ~80px base height. */
  scale: number;
  /** When true, renders in document flow (centered). Ignores x/y. Used by ClosingSlide. */
  centered?: boolean;
}

/** Base logo height in px. scale=1.0 → 80px max-height. */
const BASE_HEIGHT = 80;
const BASE_WIDTH = 300;

/**
 * Shared logo overlay for all slide types.
 *
 * Two rendering modes:
 * 1. Default: absolutely positioned using xPercent/yPercent/scale
 * 2. Centered: block element in document flow (for ClosingSlide)
 *
 * Always pulls logo URL from branding.
 * Renders nothing if no logo is configured or show=false.
 */
export function LogoOverlay({
  show,
  variant,
  branding,
  xPercent,
  yPercent,
  scale,
  centered = false,
}: LogoOverlayProps) {
  if (!show) return null;

  const primaryUrl =
    variant === "dark" ? branding.logoDarkUrl : branding.logoLightUrl;
  const fallbackUrl =
    variant === "dark" ? branding.logoLightUrl : branding.logoDarkUrl;
  const src = primaryUrl ?? fallbackUrl;

  if (!src) return null;

  const needsInvert =
    variant === "dark" && !branding.logoDarkUrl && !!branding.logoLightUrl;
  const filterStyle = needsInvert
    ? { filter: "brightness(0) invert(1)" as const }
    : {};

  const clampedScale = Math.max(0.5, Math.min(4.0, scale));
  const maxH = BASE_HEIGHT * clampedScale;
  const maxW = BASE_WIDTH * clampedScale;

  // ── Centered mode: block element in normal document flow ──
  if (centered) {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <img
          src={src}
          alt={branding.companyName}
          style={{
            maxHeight: maxH,
            maxWidth: maxW,
            objectFit: "contain",
            pointerEvents: "none",
            ...filterStyle,
          }}
        />
      </div>
    );
  }

  // ── Positioned mode: absolute x/y with scale ──
  const cx = Math.max(0, Math.min(100, xPercent));
  const cy = Math.max(0, Math.min(100, yPercent));

  return (
    <img
      src={src}
      alt={branding.companyName}
      style={{
        position: "absolute",
        left: `${cx}%`,
        top: `${cy}%`,
        maxHeight: maxH,
        maxWidth: maxW,
        objectFit: "contain",
        zIndex: 50,
        pointerEvents: "none",
        ...filterStyle,
      }}
    />
  );
}
