import * as React from "react";
import { getBrandBackgroundStyles } from "@/app/lib/brand-background-utils";

type BackgroundPreviewRecipe = {
  baseColorHex: string;
  overlayImageUrl: string | null;
  overlayOpacity: number;
  overlayScale: number;
  overlaySpacing: number;
  overlayRotation: number;
  overlayIconImageUrl: string | null;
  /** generationMode from BrandBackground — enables CSS texture preview. */
  generationMode?: string | null;
};

type BackgroundPreviewSurfaceProps = {
  recipe: BackgroundPreviewRecipe;
  className?: string;
  minHeight?: number;
  children?: React.ReactNode;
};

/**
 * When overlaySpacing is set to a very large value (≥ this threshold), the
 * overlay image is treated as a full-bleed cover visual rather than a tiling
 * pattern.  This is the convention used when saving AI slide-visual
 * backgrounds (overlaySpacing = 9999).  Without this check, computing
 * `background-size: 9999px 9999px` in a small thumbnail container would show
 * only the top-left ~2 % of the image, making it look blank.
 */
const COVER_MODE_SPACING_THRESHOLD = 2000;

export function BackgroundPreviewSurface({
  recipe,
  className,
  minHeight,
  children,
}: BackgroundPreviewSurfaceProps) {
  const base = recipe.baseColorHex || "#FFFFFF";
  const opacityPercent = recipe.overlayOpacity;
  const tileSizePx =
    recipe.overlaySpacing * (recipe.overlayScale / 100 || 1);
  const rotationDeg = recipe.overlayRotation;

  const overlayImageUrl = recipe.overlayImageUrl;
  const iconImageUrl = recipe.overlayIconImageUrl;

  // Full-bleed cover mode: triggered when the tile size would be so large that
  // repeat-tiling is meaningless.  Applies only to image overlays — icon
  // overlays are always intended as tiling patterns.
  const isCoverMode = tileSizePx >= COVER_MODE_SPACING_THRESHOLD;

  // When there's no image/icon overlay, render CSS texture from generationMode.
  const hasCssTexture = !overlayImageUrl && !iconImageUrl && !!recipe.generationMode;
  const cssTextureStyle = hasCssTexture
    ? getBrandBackgroundStyles({ baseColorHex: base, generationMode: recipe.generationMode ?? null })
    : null;

  return (
    <div
      className={
        "relative overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 " +
        (className ?? "")
      }
      style={{
        // CSS texture overrides plain backgroundColor when generationMode is present.
        ...(cssTextureStyle ?? { backgroundColor: base }),
        ...(minHeight ? { minHeight } : {}),
      }}
    >
      {overlayImageUrl ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: opacityPercent / 100,
            backgroundImage: `url(${overlayImageUrl})`,
            ...(isCoverMode
              ? {
                  // Full-bleed: scale to cover container, centre, no repeat.
                  // This is the correct rendering for slide-visual AI images.
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {
                  // Tiling pattern (subtle-texture / blueprint-overlay).
                  backgroundRepeat: "repeat",
                  backgroundSize: `${tileSizePx}px ${tileSizePx}px`,
                  transform: `rotate(${rotationDeg}deg)`,
                  transformOrigin: "center",
                }),
          }}
          aria-hidden
        />
      ) : iconImageUrl ? (
        // Icon overlays are always tiling patterns — cover mode never applies.
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: opacityPercent / 100,
            backgroundImage: `url(${iconImageUrl})`,
            backgroundRepeat: "repeat",
            backgroundSize: `${tileSizePx}px ${tileSizePx}px`,
            transform: `rotate(${rotationDeg}deg)`,
            transformOrigin: "center",
          }}
          aria-hidden
        />
      ) : null}
      {children}
    </div>
  );
}
