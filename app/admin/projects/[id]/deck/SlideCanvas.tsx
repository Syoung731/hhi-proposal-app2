"use client";

import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { SlideRenderer } from "./slides/SlideRenderer";

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
                style={
                  activeBg.previewImageUrl
                    ? {
                        backgroundImage: `url(${activeBg.previewImageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                      }
                    : {
                        backgroundColor: activeBg.baseColorHex ?? "#ffffff",
                        backgroundImage: activeBg.overlayImageUrl
                          ? `url(${activeBg.overlayImageUrl})`
                          : undefined,
                        backgroundSize: activeBg.overlayScale
                          ? `${activeBg.overlayScale}px ${activeBg.overlayScale}px`
                          : "cover",
                        backgroundRepeat: activeBg.overlayImageUrl ? "repeat" : "no-repeat",
                        opacity: 1,
                      }
                }
              />
            )}
            <SlideRenderer slide={slide} branding={branding} />
            {/* Text zone overlay — only for slides that use zone positioning */}
            {slide.textZone && slide.type !== "before-after" && slide.type !== "risk-brief" && slide.type !== "scope-overview" && (
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
