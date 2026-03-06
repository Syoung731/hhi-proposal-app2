"use client";

import { useRef, useState, useLayoutEffect } from "react";
import { isBadPlaceholderUrl } from "@/app/lib/media";
import type { SectionTemplateSplitImage } from "./SectionTemplateSplit";

const TITLE_SCALE_DEFAULT = 1.0;
const PHOTO_AREA_DEFAULT = 58;
const SCOPE_TEXT_SCALE_DEFAULT = 1.0;
const SCOPE_TEXT_SCALE_MIN = 0.85;
const SCOPE_TEXT_SCALE_MAX = 1.25;
const MIN_SCOPE_PX = 32;
const MIN_PHOTO_PX = 80;

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type SectionTemplateComparisonCollageProps = {
  title: string;
  beforeImage?: SectionTemplateSplitImage | null;
  afterImage?: SectionTemplateSplitImage | null;
  referenceImages: SectionTemplateSplitImage[];
  scopeText?: string | null;
  titleScale?: number;
  photoAreaPct?: number;
  scopeTextScale?: number;
  preview?: boolean;
  /** When true, reference column images use object-contain (show full image, no crop). Matches Live Preview. */
  referenceImageContain?: boolean;
};

/** Brand accent (orange) for borders and divider — matches SectionTemplateSplit. */
const BRAND_ACCENT = "#E07A2F";

/**
 * Single image slot: constrained wrapper so layout never blows up.
 * In preview mode (or when useContain) uses object-contain so image stays fully visible inside the slot.
 */
function ImageSlot({
  image,
  emptyLabel,
  preview = false,
  useContain = false,
}: {
  image: SectionTemplateSplitImage | null;
  emptyLabel: string;
  preview?: boolean;
  useContain?: boolean;
}) {
  const hasImage = image?.url && !isBadPlaceholderUrl(image.url);
  const showContain = preview || useContain;

  if (!hasImage) {
    return (
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
          {emptyLabel}
        </div>
      </div>
    );
  }

  if (showContain) {
    return (
      <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image!.url}
          alt={image!.caption ?? ""}
          className="max-h-full max-w-full object-contain object-center"
          style={{
            display: "block",
            width: "auto",
            height: "auto",
            borderRadius: "0.5rem",
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image!.url}
        alt={image!.caption ?? ""}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function ScopePanel({
  scopeText,
  scopeTextScale = SCOPE_TEXT_SCALE_DEFAULT,
  preview,
}: {
  scopeText: string | null | undefined;
  scopeTextScale?: number;
  preview?: boolean;
}) {
  const text = (scopeText ?? "").trim() || "—";
  const scale = Math.min(SCOPE_TEXT_SCALE_MAX, Math.max(SCOPE_TEXT_SCALE_MIN, scopeTextScale));
  const bodyFontRem = 0.9 * scale;
  const headerFontRem = 1.25 * bodyFontRem;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-zinc-200 bg-zinc-50/90 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800/80">
      <p
        className="shrink-0 font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        style={{ fontSize: `${headerFontRem}rem` }}
      >
        SCOPE OF WORK
      </p>
      <div
        className={`min-h-0 flex-1 leading-snug text-zinc-700 dark:text-zinc-300 ${
          preview ? "overflow-hidden" : "line-clamp-4 overflow-hidden"
        }`}
        style={{ fontSize: `${bodyFontRem}rem` }}
      >
        {text}
      </div>
    </div>
  );
}

export function SectionTemplateComparisonCollage({
  title,
  beforeImage = null,
  afterImage = null,
  referenceImages = [],
  scopeText = null,
  titleScale = TITLE_SCALE_DEFAULT,
  photoAreaPct = PHOTO_AREA_DEFAULT,
  scopeTextScale = SCOPE_TEXT_SCALE_DEFAULT,
  preview = false,
  referenceImageContain = false,
}: SectionTemplateComparisonCollageProps) {
  const slideRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<{
    titlePx: number;
    photoPx: number;
    scopePx: number;
  } | null>(null);

  const scale = clampNum(
    typeof titleScale === "number" && Number.isFinite(titleScale) ? titleScale : TITLE_SCALE_DEFAULT,
    0.85,
    1.25
  );
  const scopeScale = clampNum(
    typeof scopeTextScale === "number" && Number.isFinite(scopeTextScale) ? scopeTextScale : SCOPE_TEXT_SCALE_DEFAULT,
    SCOPE_TEXT_SCALE_MIN,
    SCOPE_TEXT_SCALE_MAX
  );
  const photoPct = clampNum(
    typeof photoAreaPct === "number" && Number.isFinite(photoAreaPct) ? photoAreaPct : PHOTO_AREA_DEFAULT,
    40,
    72
  );

  const titleFontSizeRem = 1.5 * scale;
  const padding = "px-5 py-4";

  const refSlots = Array.from({ length: 3 }, (_, i) => referenceImages[i] ?? null);

  const computeRows = () => {
    const slide = slideRef.current;
    const header = headerRef.current;
    if (!slide || !header) return;
    const totalH = slide.clientHeight;
    if (totalH <= 0) return;
    const titlePx = header.offsetHeight;
    const remainingH = totalH - titlePx;
    const targetPhotoPx = clampNum(
      Math.round((totalH * photoPct) / 100),
      MIN_PHOTO_PX,
      remainingH - MIN_SCOPE_PX
    );
    const photoPx = targetPhotoPx;
    const scopePx = remainingH - photoPx;
    setRows({ titlePx, photoPx, scopePx });
  };

  useLayoutEffect(() => {
    const slide = slideRef.current;
    if (!slide) return;
    const ro = new ResizeObserver(() => setRows(null));
    ro.observe(slide);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    setRows(null);
  }, [scopeText, scopeScale]);

  useLayoutEffect(() => {
    const slide = slideRef.current;
    const header = headerRef.current;
    if (!slide || !header) return;
    const raf = requestAnimationFrame(() => {
      if (slideRef.current && headerRef.current) computeRows();
    });
    return () => cancelAnimationFrame(raf);
  }, [photoPct, rows]);

  const gridRowsStyle =
    rows !== null
      ? { gridTemplateRows: `${rows.titlePx}px ${rows.photoPx}px ${rows.scopePx}px` }
      : { gridTemplateRows: "auto 1fr auto" as const };

  return (
    <div className="w-full max-w-full">
      <div
        ref={slideRef}
        className="grid w-full overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
        style={{ aspectRatio: "16/9", ...gridRowsStyle }}
      >
        <header
          ref={headerRef}
          className={`flex min-h-0 items-center shrink-0 ${padding}`}
        >
          <h1
            className="truncate font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
            style={{ fontSize: `${titleFontSizeRem}rem` }}
          >
            {title}
          </h1>
        </header>

        {/* Photo row: left comparison block, right reference column (wider than 1fr so reference images have room when using object-contain) */}
        <div
          className={`relative grid min-h-0 ${padding} pt-0`}
          style={{ gridTemplateColumns: "3fr 2fr", gap: "0.5rem" }}
        >
          {/* LEFT: Before + Render side by side; labels centered over each photo (like Template 1) */}
          <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-hidden" style={{ minHeight: 0 }}>
              <div className="flex min-h-0 min-w-0 overflow-hidden rounded-lg">
                <ImageSlot image={beforeImage} emptyLabel="No before photo" preview={preview} />
              </div>
              <div className="flex min-h-0 min-w-0 overflow-hidden rounded-lg">
                <ImageSlot image={afterImage} emptyLabel="Renderings pending" preview={preview} />
              </div>
            </div>
            {/* Labels over the photos, each centered over its column (same as Template 1) */}
            <div
              className="pointer-events-none absolute inset-0 z-10 flex gap-2"
              aria-hidden
            >
              <div className="flex min-w-0 flex-1 items-start justify-center pt-2">
                <span
                  className="rounded px-1.5 py-0.5 bg-white/90 text-sm font-bold uppercase tracking-[0.2em] dark:bg-zinc-900/90"
                  style={{ color: BRAND_ACCENT }}
                >
                  Before
                </span>
              </div>
              <div className="flex min-w-0 flex-1 items-start justify-center pt-2">
                <span
                  className="rounded px-1.5 py-0.5 bg-white/90 text-sm font-bold uppercase tracking-[0.2em] dark:bg-zinc-900/90"
                  style={{ color: BRAND_ACCENT }}
                >
                  Render
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT: label "Reference" centered above the photos; 3 equal-height slots */}
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="pointer-events-none flex shrink-0 justify-center pb-1" aria-hidden>
              <span
                className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-700 dark:text-zinc-300"
                style={{ color: BRAND_ACCENT }}
              >
                Reference
              </span>
            </div>
            <div
              className="grid min-h-0 flex-1 overflow-hidden"
              style={{
                gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
                gap: "0.25rem",
                minHeight: 0,
              }}
            >
              {refSlots.map((img, i) => (
                <div key={i} className="flex min-h-0 min-w-0 overflow-hidden rounded-lg">
                  <ImageSlot image={img} emptyLabel="Reference photo" preview={preview} useContain={referenceImageContain} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`min-h-0 shrink-0 overflow-hidden ${padding} pt-0`}>
          <ScopePanel scopeText={scopeText} scopeTextScale={scopeScale} preview={preview} />
        </div>
      </div>
    </div>
  );
}
