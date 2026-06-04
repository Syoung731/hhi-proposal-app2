"use client";

import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { SlideRenderer } from "@/app/admin/projects/[id]/deck/slides/SlideRenderer";
import { getBrandBackgroundStyles, isBackgroundDark } from "@/app/lib/brand-background-utils";

// Slide types that DO NOT consume slide.textZone at render time. Audit:
// only CoverSlide reads slide.textZone (CoverSlide.tsx:108, 237, 422, 602)
// to position headline/body when textZone + backgroundId are both set.
// Every other slide type ignores the field, so the dashed admin overlay
// would just be visual noise (Steve's "ghost line" report).
const TEXT_ZONE_OVERLAY_EXCLUDED_TYPES: ReadonlySet<string> = new Set([
  "objective",
  "investment-by-space",
  "why-us",
  "scope-overview",
  "before-after",
  "scope-breakdown",
  "risk-brief",
  "our-process",
  "core-values",
  "timeline",
  "cope",
  "overall-investment",
  "next-steps",
  "closing",
  "inspiration",
  "testimonials",
  "design-build",
  "addition-overview",
]);

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  brandBackgrounds?: BrandBackgroundForUI[];
  /**
   * When true, the admin-only dashed text-zone debug overlay is suppressed.
   * Always true in client-facing contexts (Vibe presentation, PDF render).
   */
  hideTextZoneOverlay?: boolean;
  /**
   * When true, slide components render editor-only affordances (e.g. the
   * inspiration slide's empty-photo placeholders). The admin SlideCanvas
   * passes true; client-facing PrintStack / PresentationFrame leave it
   * false so empty slots render as plain panels in the published PDF.
   */
  isEditing?: boolean;
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
  isEditing = false,
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
    !TEXT_ZONE_OVERLAY_EXCLUDED_TYPES.has(slide.type);

  return (
    <>
      {/* Warm linen default behind slides with no brand/AI background, so
          transparent slides read as designed paper instead of flat white.
          Slides that paint their own opaque (navy/charcoal/white) surface
          cover this, so it only affects the otherwise-blank ones. */}
      {!activeBg && !slide.aiBackground && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(120% 120% at 0% 0%, #FAF7F1 0%, #F4EDE1 55%, #EFE7D8 100%)",
          }}
        />
      )}

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
          isEditing={isEditing}
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
