"use client";

import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { SlideRenderer } from "@/app/admin/projects/[id]/deck/slides/SlideRenderer";
import { getBrandBackgroundStyles, isBackgroundDark } from "@/app/lib/brand-background-utils";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  brandBackgrounds?: BrandBackgroundForUI[];
  /**
   * When true, the admin-only dashed text-zone debug overlay is suppressed.
   * Always true in client-facing contexts (Vibe presentation, PDF render).
   */
  hideTextZoneOverlay?: boolean;
}

/**
 * The 16:9 composite slide card — single source of truth for slide rendering.
 *
 * Responsibilities:
 *   Layer 0  brand background (if slide.backgroundId resolves)
 *   Layer 1  AI background (slide.aiBackground) + softening scrim
 *   Layer 2  slide content via SlideRenderer
 *   Layer 3  optional admin text-zone debug overlay (gated by hideTextZoneOverlay)
 *
 * This component renders the card ONLY — no outer layout, no padding, no
 * backdrop. Callers (SlideCanvas for the editor, PresentationFrame for Vibe)
 * own the surrounding chrome + 16:9 aspect sizing.
 *
 * Renders nothing for disabled slides (isEnabled=false). In the editor the
 * SlideCanvas wrapper provides its own "Slide hidden" placeholder; in the
 * presentation, disabled slides are excluded upstream.
 */
export function SlideCard({
  slide,
  branding,
  brandBackgrounds = [],
  hideTextZoneOverlay = false,
}: Props) {
  const activeBg = slide.backgroundId
    ? brandBackgrounds.find((b) => b.id === slide.backgroundId) ?? null
    : null;

  const hasBrandDarkBackground =
    !slide.aiBackground && activeBg ? isBackgroundDark(activeBg.baseColorHex) : false;

  function getBgLayerStyle(): React.CSSProperties {
    if (!activeBg) return {};
    if (activeBg.previewImageUrl) {
      return {
        backgroundImage: `url(${activeBg.previewImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }
    if (activeBg.overlayImageUrl) {
      return {
        backgroundColor: activeBg.baseColorHex ?? "#ffffff",
        backgroundImage: `url(${activeBg.overlayImageUrl})`,
        backgroundSize: `${activeBg.overlayScale ?? 100}px ${activeBg.overlayScale ?? 100}px`,
        backgroundRepeat: "repeat",
      };
    }
    return getBrandBackgroundStyles(activeBg) as React.CSSProperties;
  }

  const showTextZone =
    !hideTextZoneOverlay &&
    slide.textZone &&
    slide.type !== "before-after" &&
    slide.type !== "risk-brief" &&
    slide.type !== "scope-overview" &&
    slide.type !== "objective" &&
    slide.type !== "visual-inspiration";

  return (
    <>
      {activeBg && (
        <div className="absolute inset-0 pointer-events-none" style={getBgLayerStyle()} />
      )}

      {slide.aiBackground && (
        <>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${slide.aiBackground})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              zIndex: 1,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "rgba(255,255,255,0.12)",
              zIndex: 2,
            }}
          />
        </>
      )}

      <div style={{ position: "relative", zIndex: 3, width: "100%", height: "100%" }}>
        <SlideRenderer
          slide={slide}
          branding={branding}
          hasBrandDarkBackground={hasBrandDarkBackground}
        />
      </div>

      {showTextZone && slide.textZone && (
        <div
          className="pointer-events-none absolute z-50"
          style={{
            left: `${slide.textZone.x * 100}%`,
            top: `${slide.textZone.y * 100}%`,
            width: `${slide.textZone.width * 100}%`,
            height: `${slide.textZone.height * 100}%`,
            border: "1.5px dashed rgba(255,255,255,0.55)",
            borderRadius: "3px",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <span className="absolute -left-[3px] -top-[3px] h-[6px] w-[6px] rounded-full bg-white/60" />
          <span className="absolute -right-[3px] -top-[3px] h-[6px] w-[6px] rounded-full bg-white/60" />
          <span className="absolute -left-[3px] -bottom-[3px] h-[6px] w-[6px] rounded-full bg-white/60" />
          <span className="absolute -right-[3px] -bottom-[3px] h-[6px] w-[6px] rounded-full bg-white/60" />
        </div>
      )}
    </>
  );
}
