/**
 * Shared utilities for brand background visual rendering.
 *
 * Used by:
 *   - SlideCanvas.tsx          (slide brand-background layer)
 *   - BackgroundPreviewSurface (library live preview)
 *   - InspectorPanel.tsx       (background picker swatches)
 *
 * These are pure functions with no React or browser dependencies so they
 * can run safely on the server or client.
 */

export type BgStyleInput = {
  baseColorHex: string | null;
  generationMode: string | null;
} | null;

/** Plain CSS properties subset — avoids importing React just for the type. */
export type BgStyleResult = {
  background?: string;
  backgroundColor?: string;
};

// ─── Luminance / dark detection ───────────────────────────────────────────────

/**
 * Returns true when the hex color's perceived brightness is below 128.
 * Uses the standard perceived-brightness formula: 0.299R + 0.587G + 0.114B.
 */
export function isBackgroundDark(hex: string | null | undefined): boolean {
  if (!hex) return false;
  const h = hex.replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

// ─── CSS background style by generationMode ──────────────────────────────────

/**
 * Returns complete background CSS for a BrandBackground record.
 *
 * "blueprint-overlay"  → fine CSS grid lines layered over baseColorHex.
 * "subtle-texture"     → soft radial-gradient vignette that breaks the flat-
 *                        digital look without being visible at a glance.
 * "slide-visual" / null → plain backgroundColor only (image overlay handles
 *                         the visual when an overlayImageUrl is present).
 */
export function getBrandBackgroundStyles(bg: BgStyleInput): BgStyleResult {
  if (!bg) return {};

  const base  = bg.baseColorHex ?? "#FFFFFF";
  const dark  = isBackgroundDark(base);

  // ── Blueprint grid ────────────────────────────────────────────────────────
  if (bg.generationMode === "blueprint-overlay") {
    const lineColor = dark
      ? "rgba(255,255,255,0.10)"
      : "rgba(26,35,50,0.11)";
    return {
      background: [
        `repeating-linear-gradient(0deg,  ${lineColor} 0px, ${lineColor} 1px, transparent 1px, transparent 24px)`,
        `repeating-linear-gradient(90deg, ${lineColor} 0px, ${lineColor} 1px, transparent 1px, transparent 24px)`,
        base,
      ].join(", "),
    };
  }

  // ── Subtle paper/linen texture ────────────────────────────────────────────
  if (bg.generationMode === "subtle-texture") {
    if (dark) {
      // On dark: faint bright ellipse top-left, slight depth bottom-right
      return {
        background: [
          "radial-gradient(ellipse at 20% 20%, rgba(255,255,255,0.05) 0%, transparent 60%)",
          "radial-gradient(ellipse at 80% 80%, rgba(0,0,0,0.12) 0%, transparent 60%)",
          "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.02) 0%, transparent 70%)",
          base,
        ].join(", "),
      };
    } else {
      // On light: micro-highlight top-left, micro-shadow bottom-right
      return {
        background: [
          "radial-gradient(ellipse at 20% 20%, rgba(255,255,255,0.08) 0%, transparent 60%)",
          "radial-gradient(ellipse at 80% 80%, rgba(0,0,0,0.04) 0%, transparent 60%)",
          "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.02) 0%, transparent 70%)",
          base,
        ].join(", "),
      };
    }
  }

  // ── Default: flat color (slide-visual / null) ─────────────────────────────
  return { backgroundColor: base };
}
