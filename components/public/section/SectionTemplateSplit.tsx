"use client";

import { useRef, useState, useLayoutEffect } from "react";
import { isBadPlaceholderUrl } from "@/app/lib/media";

export type SectionTemplateSplitImage = {
  id: string;
  url: string;
  caption?: string | null;
};

const TITLE_SCALE_DEFAULT = 1.0;
const PHOTO_AREA_DEFAULT = 58;
const SCOPE_AREA_DEFAULT = 22;
const TITLE_ROW_MAX_PCT = 18;
const SCOPE_TEXT_SCALE_DEFAULT = 1.0;
const SCOPE_TEXT_SCALE_MIN = 0.85;
const SCOPE_TEXT_SCALE_MAX = 1.25;
const MIN_SCOPE_PX = 32;
const MIN_PHOTO_PX = 80;

type SectionTemplateSplitProps = {
  /** Section/room name (e.g. "Guest Bathroom (Hall Bath With Shower)") */
  title: string;
  /** Up to 3 "Before" (current) images */
  beforeImages: SectionTemplateSplitImage[];
  /** Up to 3 "After" (future) images */
  afterImages: SectionTemplateSplitImage[];
  /** When true, only AFTER column has content; BEFORE shows placeholder or layout is full-width AFTER */
  onlyAfter?: boolean;
  /** When true, only BEFORE column has content; AFTER shows "Renderings pending" placeholder */
  onlyBefore?: boolean;
  /** Layout density: 1 = 1-up, 2 = 2-up, 3 = 3-up. Default 2. */
  splitDensity?: 1 | 2 | 3;
  /** Scope of Work text (from room/section). Shown in bottom panel when provided. */
  scopeText?: string | null;
  /** Title font size multiplier. Default 1.2. */
  titleScale?: number;
  /** Photo row height as % of slide (remaining space after title + auto scope). Default 62. */
  photoAreaPct?: number;
  /** @deprecated Scope row is now auto-sized from content; ignored for split layout. Kept for backwards compat. */
  scopeAreaPct?: number;
  /** Scope body text size scale. Default 1.0. Range 0.85–1.25. */
  scopeTextScale?: number;
  /** Optional: render for fixed 16:9 canvas (admin preview) */
  preview?: boolean;
};

/** Brand accent (orange) for borders and divider. */
const BRAND_ACCENT = "#E07A2F";

const columnLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-400";

/** Single slot: image frame (rounded, border) or placeholder. In preview, scale to fit so 100% of photo is visible. */
function ImageSlot({
  image,
  emptyLabel,
  preview = false,
}: {
  image: SectionTemplateSplitImage | null;
  emptyLabel: string;
  preview?: boolean;
}) {
  const hasImage = image?.url && !isBadPlaceholderUrl(image.url);

  if (!hasImage) {
    return (
      <div
        className={`relative min-h-0 flex-1 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 ${preview ? "" : "border"}`}
        style={preview ? undefined : { borderColor: BRAND_ACCENT }}
      >
        <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
          {emptyLabel}
        </div>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image!.url}
          alt={image!.caption ?? ""}
          className="max-h-full max-w-full object-contain object-center"
          style={{
            display: "block",
            width: "auto",
            height: "auto",
            border: `1px solid ${BRAND_ACCENT}`,
            borderRadius: "0.5rem",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-zinc-100 dark:bg-zinc-800"
      style={{ borderColor: BRAND_ACCENT }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image!.url}
        alt={image!.caption ?? ""}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

/** Column with N stacked slots and thin horizontal dividers between (when N > 1). */
function StackedSlotsColumn({
  images,
  emptyLabel,
  density,
  columnLabel,
  preview = false,
}: {
  images: SectionTemplateSplitImage[];
  emptyLabel: string;
  density: number;
  columnLabel: string;
  preview?: boolean;
}) {
  const n = Math.min(Math.max(1, density), 3);
  const slots = Array.from({ length: n }, (_, i) => images[i] ?? null);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col min-h-0">
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {slots.map((img, i) => (
          <div key={i} className="flex min-h-0 flex-1 flex-col">
            {i > 0 && (
              <div
                className="shrink-0 h-px w-full"
                style={{ background: BRAND_ACCENT, opacity: 0.4 }}
              />
            )}
            <ImageSlot image={img} emptyLabel={emptyLabel} preview={preview} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vertical divider between columns. */
function VerticalDivider() {
  return (
    <div
      className="shrink-0 w-px self-stretch min-h-0"
      style={{ background: BRAND_ACCENT }}
      aria-hidden
    />
  );
}

/** Scope of Work panel at bottom of slide. */
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

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function SectionTemplateSplit({
  title,
  beforeImages,
  afterImages,
  onlyAfter = false,
  onlyBefore = false,
  splitDensity = 2,
  scopeText = null,
  titleScale = TITLE_SCALE_DEFAULT,
  photoAreaPct = PHOTO_AREA_DEFAULT,
  scopeAreaPct = SCOPE_AREA_DEFAULT,
  scopeTextScale = SCOPE_TEXT_SCALE_DEFAULT,
  preview = false,
}: SectionTemplateSplitProps) {
  const slideRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<{
    titlePx: number;
    photoPx: number;
    scopePx: number;
  } | null>(null);

  const density = splitDensity === 1 || splitDensity === 2 || splitDensity === 3 ? splitDensity : 2;
  const hasBefore = beforeImages.length > 0 && !onlyAfter;
  const hasAfter = afterImages.length > 0 && !onlyBefore;

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
  const photoRowFlexClass = "flex min-h-0 gap-1 overflow-hidden";

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

  // When scope text or scale changes, clear rows so layout can reflow.
  useLayoutEffect(() => {
    setRows(null);
  }, [scopeText, scopeScale]);

  // Measure on next frame; run when rows is null or when photoPct changes.
  useLayoutEffect(() => {
    const slide = slideRef.current;
    const header = headerRef.current;
    if (!slide || !header) return;
    const raf = requestAnimationFrame(() => {
      if (slideRef.current && headerRef.current) {
        computeRows();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [photoPct, rows]);

  const gridRowsStyle =
    rows !== null
      ? { gridTemplateRows: `${rows.titlePx}px ${rows.photoPx}px ${rows.scopePx}px` }
      : { gridTemplateRows: "auto 1fr auto" as const };

  const slideInner = (
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
          className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 truncate"
          style={{ fontSize: `${titleFontSizeRem}rem` }}
        >
          {title}
        </h1>
      </header>
      <div className={`relative min-h-0 ${padding} pt-0 ${photoRowFlexClass}`}>
        {/* Labels over the photos, each centered over its column */}
        <div
          className="pointer-events-none absolute inset-0 z-10 flex gap-1"
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
          <div className="shrink-0 w-px" />
          <div className="flex min-w-0 flex-1 items-start justify-center pt-2">
            <span
              className="rounded px-1.5 py-0.5 bg-white/90 text-sm font-bold uppercase tracking-[0.2em] dark:bg-zinc-900/90"
              style={{ color: BRAND_ACCENT }}
            >
              Render
            </span>
          </div>
        </div>
        {onlyAfter && hasAfter ? (
          <div className="min-w-0 flex-1">
            <StackedSlotsColumn
              images={afterImages}
              emptyLabel="Renderings pending"
              density={density}
              columnLabel="Render"
              preview={preview}
            />
          </div>
        ) : onlyBefore ? (
          <>
            <div className="min-w-0 flex-1">
              <StackedSlotsColumn
                images={beforeImages}
                emptyLabel="No before photos"
                density={density}
                columnLabel="Before"
                preview={preview}
              />
            </div>
            <VerticalDivider />
            <div className="min-w-0 flex-1">
              <StackedSlotsColumn
                images={[]}
                emptyLabel="Renderings pending"
                density={density}
                columnLabel="Render"
                preview={preview}
              />
            </div>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <StackedSlotsColumn
                images={hasBefore ? beforeImages : []}
                emptyLabel="No before photos"
                density={density}
                columnLabel="Before"
                preview={preview}
              />
            </div>
            <VerticalDivider />
            <div className="min-w-0 flex-1">
              <StackedSlotsColumn
                images={hasAfter ? afterImages : []}
                emptyLabel="Renderings pending"
                density={density}
                columnLabel="Render"
                preview={preview}
              />
            </div>
          </>
        )}
      </div>
      <div className={`min-h-0 shrink-0 overflow-hidden ${padding} pt-0`}>
        <ScopePanel
          scopeText={scopeText}
          scopeTextScale={scopeScale}
          preview={preview}
        />
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-full">
      {slideInner}
    </div>
  );
}
