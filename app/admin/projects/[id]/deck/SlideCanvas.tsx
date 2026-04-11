"use client";

import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { SlideRenderer } from "./slides/SlideRenderer";
import { getBrandBackgroundStyles, isBackgroundDark } from "@/app/lib/brand-background-utils";

interface Props {
  slide: ProposalSlide | null;
  branding: DeckBranding;
  brandBackgrounds?: BrandBackgroundForUI[];
}

/**
 * Center 16:9 canvas that renders the active slide at full preview scale.
 * The outer wrapper fills the available center area and constrains the
 * inner canvas to a strict 16:9 aspect ratio with a presentation-style frame.
 */
export function SlideCanvas({ slide, branding, brandBackgrounds = [] }: Props) {
  const activeBg = slide?.backgroundId
    ? brandBackgrounds.find((b) => b.id === slide.backgroundId) ?? null
    : null;

  if (!slide) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "#ECEAE5" }}>
        <p className="text-sm text-zinc-400">No slide selected</p>
      </div>
    );
  }

  // Dark background detection — used to flip slide text to light colors.
  // We use baseColorHex even when a previewImageUrl is set, since the image
  // was generated from that color and will share its overall tone.
  const hasBrandDarkBackground =
    !slide.aiBackground && activeBg
      ? isBackgroundDark(activeBg.baseColorHex)
      : false;

  // Resolve the CSS style for the brand background layer.
  // Priority: previewImageUrl (cached render) → overlayImageUrl (custom image pattern) → CSS texture
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
    // CSS texture via generationMode (blueprint-overlay, subtle-texture, etc.)
    return getBrandBackgroundStyles(activeBg) as React.CSSProperties;
  }

  return (
    <div
      className="flex-1 flex items-center justify-center"
      style={{
        background: "#ECEAE5",
        padding: "32px 40px",
        overflow: "hidden",
      }}
    >
      {/* 16:9 canvas wrapper — max width constrained, aspect ratio locked */}
      <div
        style={{
          width: "100%",
          maxWidth: "min(100%, calc((100vh - 160px) * 16/9))",
          aspectRatio: "16 / 9",
          position: "relative",
          // Presentation-style shadow
          boxShadow:
            "0 4px 6px -1px rgba(0,0,0,0.1), 0 20px 60px -12px rgba(0,0,0,0.25)",
          borderRadius: 2,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        {slide.isEnabled ? (
          <>
            {/* Brand background layer — renders behind slide content */}
            {activeBg && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={getBgLayerStyle()}
              />
            )}

            {/* AI background layer — sits above brand bg, below slide content */}
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
                {/* Scrim: softens the AI image so brand text reads cleanly on top */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    zIndex: 2,
                  }}
                />
              </>
            )}

            {/* Slide content — z-index 3 keeps it above AI bg + scrim layers */}
            <div style={{ position: "relative", zIndex: 3, width: "100%", height: "100%" }}>
              <SlideRenderer
                slide={slide}
                branding={branding}
                hasBrandDarkBackground={hasBrandDarkBackground}
              />
            </div>
            {/* Text zone overlay — only for slides that use zone positioning */}
            {slide.textZone && slide.type !== "before-after" && slide.type !== "risk-brief" && slide.type !== "scope-overview" && slide.type !== "objective" && (
              <div
                className="pointer-events-none absolute z-50"
                style={{
                  left:   `${slide.textZone.x * 100}%`,
                  top:    `${slide.textZone.y * 100}%`,
                  width:  `${slide.textZone.width * 100}%`,
                  height: `${slide.textZone.height * 100}%`,
                  border: "1.5px dashed rgba(255,255,255,0.55)",
                  borderRadius: "3px",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                {/* Corner anchor dots — visual affordance only */}
                <span className="absolute -left-[3px] -top-[3px] h-[6px] w-[6px] rounded-full bg-white/60" />
                <span className="absolute -right-[3px] -top-[3px] h-[6px] w-[6px] rounded-full bg-white/60" />
                <span className="absolute -left-[3px] -bottom-[3px] h-[6px] w-[6px] rounded-full bg-white/60" />
                <span className="absolute -right-[3px] -bottom-[3px] h-[6px] w-[6px] rounded-full bg-white/60" />
              </div>
            )}
          </>
        ) : (
          /* Disabled slide placeholder */
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-3"
            style={{ background: "#F9FAFB" }}
          >
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: 48,
                height: 48,
                background: "#E5E7EB",
              }}
            >
              <span style={{ fontSize: 20 }}>👁</span>
            </div>
            <p className="text-sm font-medium text-zinc-400">Slide hidden</p>
            <p className="text-xs text-zinc-300">
              Toggle the dot in the slide rail to show this slide
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
