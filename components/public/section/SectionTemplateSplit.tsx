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
const MAX_SCOPE_PCT = 0.28;
const MIN_SCOPE_PX = 32;
const MIN_PHOTO_PX = 80;
const SCOPE_HEADER_PADDING_PX = 40;

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
  const objectFit: "contain" | "cover" = preview ? "contain" : "cover";
  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-zinc-100 dark:bg-zinc-800"
      style={{ borderColor: BRAND_ACCENT }}
    >
      {hasImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={image!.url}
          alt={image!.caption ?? ""}
          className="h-full w-full"
          style={{ objectFit }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
          {emptyLabel}
        </div>
      )}
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
    <div className="flex flex-1 min-w-0 flex-col min-h-0">
      <p className={columnLabelClass} style={{ color: BRAND_ACCENT }}>
        {columnLabel}
      </p>
      <div className="mt-1 flex flex-1 min-h-0 flex-col gap-1">
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
  scopeTextRef,
}: {
  scopeText: string | null | undefined;
  scopeTextScale?: number;
  preview?: boolean;
  scopeTextRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const text = (scopeText ?? "").trim() || "—";
  const scale = Math.min(SCOPE_TEXT_SCALE_MAX, Math.max(SCOPE_TEXT_SCALE_MIN, scopeTextScale));
  const bodyFontRem = 0.9 * scale;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-zinc-200 bg-zinc-50/90 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800/80">
      <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        SCOPE OF WORK
      </p>
      <div
        ref={scopeTextRef}
        className={`min-h-0 flex-1 overflow-hidden leading-snug text-zinc-700 dark:text-zinc-300 ${
          preview ? "overflow-y-auto" : "line-clamp-4"
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
  const scopeRef = useRef<HTMLDivElement>(null);
  const scopeTextRef = useRef<HTMLDivElement>(null);

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
  const photoRowFlexClass = "flex min-h-0 gap-3 overflow-hidden";

  const computeRows = () => {
    const slide = slideRef.current;
    const header = headerRef.current;
    const scopeEl = scopeRef.current;
    const textEl = scopeTextRef.current;
    if (!slide || !header || !scopeEl) return;
    const totalH = slide.clientHeight;
    if (totalH <= 0) return;
    const titlePx = header.offsetHeight;
    const remainingH = totalH - titlePx;

    // Photo area %: reserve at least this much of the slide for the photo row (slider controls this).
    const minPhotoPxFromSlider = Math.round((totalH * photoPct) / 100);
    const minPhotoPxReserved = Math.max(MIN_PHOTO_PX, minPhotoPxFromSlider);

    // Scope: size from content (scrollHeight) at current font scale, but cap so photo area gets its reserved space.
    const scopeContentH = textEl ? textEl.scrollHeight : 0;
    const maxScopeByPct = Math.max(MIN_SCOPE_PX, totalH * MAX_SCOPE_PCT);
    const maxScopeByPhoto = remainingH - minPhotoPxReserved;
    const maxScopePx = Math.min(maxScopeByPct, maxScopeByPhoto);
    const desiredScopePx = Math.min(maxScopePx, Math.max(MIN_SCOPE_PX, scopeContentH + SCOPE_HEADER_PADDING_PX));
    const scopePx = Math.min(desiredScopePx, maxScopePx);
    const photoPx = remainingH - scopePx;
    setRows({ titlePx, photoPx, scopePx });
  };

  useLayoutEffect(() => {
    const slide = slideRef.current;
    if (!slide) return;
    const ro = new ResizeObserver(() => setRows(null));
    ro.observe(slide);
    return () => ro.disconnect();
  }, []);

  // When scope text or scale changes, clear rows so layout can reflow before we measure.
  useLayoutEffect(() => {
    setRows(null);
  }, [scopeText, scopeScale]);

  // Measure on next frame so DOM (and font size) is updated; run when rows is null or when photoPct changes.
  useLayoutEffect(() => {
    const slide = slideRef.current;
    const header = headerRef.current;
    if (!slide || !header) return;
    const raf = requestAnimationFrame(() => {
      if (slideRef.current && headerRef.current && scopeRef.current) {
        computeRows();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [scopeText, scopeScale, photoPct, rows]);

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
      <div className={`min-h-0 ${padding} pt-0 ${photoRowFlexClass}`}>
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
      <div ref={scopeRef} className={`min-h-0 shrink-0 overflow-hidden ${padding} pt-0`}>
        <ScopePanel
          scopeText={scopeText}
          scopeTextScale={scopeScale}
          preview={preview}
          scopeTextRef={scopeTextRef}
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
