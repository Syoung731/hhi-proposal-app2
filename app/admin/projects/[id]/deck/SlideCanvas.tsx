"use client";

import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { SlideCard } from "@/app/lib/deck/SlideCard";

interface Props {
  slide: ProposalSlide | null;
  branding: DeckBranding;
  brandBackgrounds?: BrandBackgroundForUI[];
}

/**
 * Center 16:9 canvas that renders the active slide at full preview scale.
 * The outer wrapper fills the available center area and constrains the
 * inner canvas to a strict 16:9 aspect ratio with a presentation-style frame.
 *
 * Delegates the composite (brand bg / AI bg / content / text-zone overlay)
 * to SlideCard — the single source of truth shared with the Vibe public
 * renderer at /proposals/[snapshotId].
 */
export function SlideCanvas({ slide, branding, brandBackgrounds = [] }: Props) {
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
          <SlideCard
            slide={slide}
            branding={branding}
            brandBackgrounds={brandBackgrounds}
          />
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
