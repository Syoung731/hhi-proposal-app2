"use client";

export interface PhotoOverlayProps {
  opacity: number; // 0-1
  color?: string; // default: '#000000'
}

/** Standard opacity presets for photo overlays. */
export const OVERLAY_PRESETS = {
  light: 0.35, // photo-forward
  medium: 0.55, // balanced
  heavy: 0.75, // text-forward
} as const;

/**
 * Shared dark overlay for photo backgrounds.
 *
 * Sits between the background image and slide content.
 * Replace per-slide inline overlay divs with this component
 * for consistent treatment across all slides.
 */
export function PhotoOverlay({ opacity, color = "#000000" }: PhotoOverlayProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}
