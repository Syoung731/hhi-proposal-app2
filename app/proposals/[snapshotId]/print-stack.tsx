"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { SlideCard } from "@/app/lib/deck/SlideCard";

interface Props {
  slides: ProposalSlide[];
  branding: DeckBranding;
  brandBackgrounds: BrandBackgroundForUI[];
  /** When set, a thin DRAFT marker strip is drawn at the top of every printed slide. */
  draftMarker?: string | null;
}

/**
 * Print-mode renderer. All enabled slides are laid out vertically, each on its
 * own 16:9 landscape page (via `break-after: page`). The PDF route hits this
 * with `?print=1` and waits for `[data-print-ready="true"]` on the root before
 * calling `page.pdf()`. The flag flips only after:
 *   a. slides are mounted,
 *   b. every tracked image (brand background preview/overlay, AI background,
 *      and any <img> under the tree) has resolved,
 *   c. `document.fonts.ready` resolves.
 */
export function PrintStack({
  slides,
  branding,
  brandBackgrounds,
  draftMarker,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  const visibleSlides = useMemo(
    () => slides.filter((s) => s.isEnabled !== false),
    [slides],
  );

  // Collect every background image URL referenced by visible slides so we can
  // preload + await them (CSS background-image URLs never fire <img> load
  // events, so we preload via `new Image()` to gate the ready flag).
  const backgroundUrls = useMemo(() => {
    const urls = new Set<string>();
    for (const slide of visibleSlides) {
      if (slide.aiBackground) urls.add(slide.aiBackground);
      if (slide.backgroundId) {
        const bg = brandBackgrounds.find((b) => b.id === slide.backgroundId);
        if (bg?.previewImageUrl) urls.add(bg.previewImageUrl);
        if (bg?.overlayImageUrl) urls.add(bg.overlayImageUrl);
      }
    }
    return Array.from(urls);
  }, [visibleSlides, brandBackgrounds]);

  useEffect(() => {
    let cancelled = false;

    async function waitForReady() {
      // (a) Backgrounds — preload each via Image so we know when they resolve.
      const bgPromises = backgroundUrls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve(); // don't block on broken URLs
            img.src = url;
          }),
      );

      // (b) <img> elements rendered inside slide content (scope breakdown,
      // design-build advantage, cope pages, core values).
      const imgPromises: Promise<void>[] = [];
      if (rootRef.current) {
        const imgs = rootRef.current.querySelectorAll("img");
        imgs.forEach((img) => {
          if (img.complete && img.naturalWidth > 0) return;
          imgPromises.push(
            new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
          );
        });
      }

      // (c) Fonts.
      const fontsPromise =
        typeof document !== "undefined" && "fonts" in document
          ? document.fonts.ready.then(() => undefined)
          : Promise.resolve();

      await Promise.all([...bgPromises, ...imgPromises, fontsPromise]);
      // Let the browser paint one frame with everything resolved.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (!cancelled) setReady(true);
    }

    waitForReady();
    return () => {
      cancelled = true;
    };
  }, [backgroundUrls]);

  if (visibleSlides.length === 0) {
    return (
      <div
        ref={rootRef}
        data-print-ready="true"
        className="flex min-h-screen items-center justify-center px-6 text-center"
      >
        <p className="text-sm text-zinc-500">This proposal has no slides.</p>
      </div>
    );
  }

  return (
    <>
      {/* Landscape A4 page sizing. `preferCSSPageSize: true` on the PDF call
          honours @page so we drive format from here. */}
      <style>{`
        @page { size: A4 landscape; margin: 0; }
        html, body { background: #fff; }
        .print-page {
          width: 297mm;
          height: 210mm;
          break-after: page;
          page-break-after: always;
          position: relative;
          overflow: hidden;
          background: #fff;
        }
        .print-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }
        .print-slide {
          position: absolute;
          inset: 0;
        }
        .print-draft-strip {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 5mm;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f4f4f2;
          border-bottom: 0.3mm solid #d4d4d0;
          color: #6b7280;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 8pt;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          z-index: 100;
        }
        .print-slide-inner {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          top: ${draftMarker ? "5mm" : "0"};
        }
      `}</style>
      <div ref={rootRef} data-print-ready={ready ? "true" : "false"}>
        {visibleSlides.map((slide) => (
          <div key={slide.id} className="print-page">
            {draftMarker && (
              <div className="print-draft-strip">{draftMarker}</div>
            )}
            <div className="print-slide-inner">
              <SlideCard
                slide={slide}
                branding={branding}
                brandBackgrounds={brandBackgrounds}
                hideTextZoneOverlay
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
