import * as React from "react";

type BackgroundPreviewRecipe = {
  baseColorHex: string;
  overlayImageUrl: string | null;
  overlayOpacity: number;
  overlayScale: number;
  overlaySpacing: number;
  overlayRotation: number;
  overlayIconImageUrl: string | null;
};

type BackgroundPreviewSurfaceProps = {
  recipe: BackgroundPreviewRecipe;
  className?: string;
  minHeight?: number;
  children?: React.ReactNode;
};

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

  return (
    <div
      className={
        "relative overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 " +
        (className ?? "")
      }
      style={{
        backgroundColor: base,
        ...(minHeight ? { minHeight } : {}),
      }}
    >
      {overlayImageUrl ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: opacityPercent / 100,
            backgroundImage: `url(${overlayImageUrl})`,
            backgroundRepeat: "repeat",
            backgroundSize: `${tileSizePx}px ${tileSizePx}px`,
            transform: `rotate(${rotationDeg}deg)`,
            transformOrigin: "center",
          }}
          aria-hidden
        />
      ) : iconImageUrl ? (
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

