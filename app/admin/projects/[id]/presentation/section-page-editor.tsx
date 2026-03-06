"use client";

import { useMemo, useState, useCallback } from "react";
import type { SectionPageConfig } from "@/app/lib/layout-config";
import type { PresentationConfigSaved } from "@/app/lib/layout-config";
import { getSectionConfig } from "./types";
import { formatInchesToFeetInches } from "@/app/lib/dimensions";
import { SectionTemplateSplit } from "@/components/public/section/SectionTemplateSplit";
import { SlidePreviewFrame } from "./slide-preview-frame";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

type SectionLayoutVariant = SectionPageConfig["layoutVariant"];

const SECTION_TEMPLATES: {
  id: SectionLayoutVariant;
  title: string;
  subtitle: string;
}[] = [
  { id: "split", title: "Template 1", subtitle: "Before/After (Split)" },
  { id: "heroAfter", title: "Template 2", subtitle: "Hero After" },
  { id: "storyboard", title: "Template 3", subtitle: "Storyboard" },
];

const SECTION_DESIGN_W = 1200;
const SECTION_DESIGN_H = 675;

export type SectionTemplatePayload = {
  title: string;
  scopeText: string;
  dimensions: { length: string; width: string; ceiling: string };
  beforeImages: { id: string; url: string; caption?: string | null }[];
  afterImages: { id: string; url: string; caption?: string | null }[];
  splitDensity: 1 | 2 | 3;
  titleScale: number;
  photoAreaPct: number;
  scopeAreaPct: number;
  scopeTextScale: number;
};

type MediaItem = { id: string; url: string; type?: string; roomId?: string | null };

function topUpSelection<T extends { id: string }>(
  selected: T[],
  pool: T[],
  n: number
): T[] {
  if (selected.length >= n) return selected.slice(0, n);
  const selectedSet = new Set(selected.map((x) => x.id));
  const filler = pool.filter((x) => !selectedSet.has(x.id));
  return [...selected, ...filler].slice(0, n);
}

/** Resolve before images: selected order first, then top-up from pool to fill N slots. */
function resolveBeforeImages(
  existingPhotos: { id: string; url: string }[],
  beforeSelectedMediaIds: string[],
  maxN: number
): SectionTemplatePayload["beforeImages"] {
  const byId = new Map(existingPhotos.map((m) => [m.id, m]));
  const n = Math.min(maxN, 3);

  const selectedOrdered = beforeSelectedMediaIds
    .map((id) => byId.get(id))
    .filter(Boolean) as { id: string; url: string }[];

  const finalList =
    beforeSelectedMediaIds.length > 0
      ? topUpSelection(selectedOrdered, existingPhotos, n)
      : existingPhotos.slice(0, n);

  return finalList.slice(0, n).map((m) => ({ id: m.id, url: m.url, caption: null }));
}

/** Resolve after images: selected order (featured first if set), then top-up from pool to fill N slots. */
function resolveAfterImages(
  roomMedia: { id: string; url: string; label?: string }[],
  featuredConceptMediaId: string | null,
  afterSelectedMediaIds: string[],
  maxN: number
): SectionTemplatePayload["afterImages"] {
  const byId = new Map(roomMedia.map((m) => [m.id, m]));
  const n = Math.min(maxN, 3);

  let selectedOrdered = afterSelectedMediaIds
    .map((id) => byId.get(id))
    .filter(Boolean) as { id: string; url: string }[];

  if (featuredConceptMediaId && roomMedia.some((m) => m.id === featuredConceptMediaId)) {
    const featured = byId.get(featuredConceptMediaId);
    if (featured) {
      selectedOrdered = [featured, ...selectedOrdered.filter((m) => m.id !== featuredConceptMediaId)];
    }
  }

  const finalList =
    afterSelectedMediaIds.length > 0
      ? topUpSelection(selectedOrdered, roomMedia, n)
      : featuredConceptMediaId && roomMedia.length > 0
        ? (() => {
            const featured = roomMedia.find((m) => m.id === featuredConceptMediaId);
            const rest = roomMedia.filter((m) => m.id !== featuredConceptMediaId);
            const list = featured ? [featured, ...rest] : roomMedia;
            return list.slice(0, n);
          })()
        : roomMedia.slice(0, n);

  return finalList.slice(0, n).map((m) => ({ id: m.id, url: m.url, caption: null }));
}

type SectionPageEditorProps = {
  sectionKey: string;
  sectionTitle: string;
  config: PresentationConfigSaved;
  onConfigChange: (config: PresentationConfigSaved) => void;
  /** Room-scoped render media (RENDERING type for this room). */
  roomMedia: { id: string; url: string; label?: string }[];
  /** Existing photos for this room (same list as Media tab "Existing Photos"; type EXISTING, roomId match). */
  existingPhotosForRoom: { id: string; url: string }[];
  /** Room from Sections tab (scope + dimensions); read-only in this editor. */
  room?: { scopeNarrative?: string; lengthIn?: number | null; widthIn?: number | null; ceilingHeightIn?: number | null } | null;
  /** All project media (for before/after image derivation). */
  media?: MediaItem[];
};

/** Thumbnail picker: click toggles selection, max = maxCount, "Selected x / max", order badges, Clear. */
function MediaThumbnailPicker({
  items,
  selectedIds,
  onChange,
  label,
  emptyMessage,
  maxCount,
  trimMessage,
}: {
  items: { id: string; url: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label: string;
  emptyMessage: string;
  maxCount: number;
  trimMessage?: string;
}) {
  const toggle = (id: string) => {
    const idx = selectedIds.indexOf(id);
    if (idx >= 0) {
      onChange(selectedIds.filter((_, i) => i !== idx));
      return;
    }
    if (selectedIds.length >= maxCount) return;
    onChange([...selectedIds, id]);
  };
  const clear = () => onChange([]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className={labelClass}>{label}</label>
        {items.length > 0 && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Selected {selectedIds.length} / {maxCount}
          </span>
        )}
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            Clear
          </button>
        )}
      </div>
      {trimMessage && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{trimMessage}</p>
      )}
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((m) => {
            const index = selectedIds.indexOf(m.id);
            const selected = index >= 0;
            const atMax = selectedIds.length >= maxCount && !selected;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                disabled={atMax}
                className={`relative flex h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                  selected
                    ? "border-emerald-500 ring-2 ring-emerald-300 dark:border-emerald-400"
                    : atMax
                      ? "cursor-not-allowed border-zinc-200 opacity-60 dark:border-zinc-700"
                      : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url || "/placeholder.svg"}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {selected && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionLivePreview({
  payload,
  layoutVariant,
}: {
  payload: SectionTemplatePayload;
  layoutVariant: SectionLayoutVariant;
}) {
  if (layoutVariant === "split") {
    return (
      <SlidePreviewFrame
        designW={SECTION_DESIGN_W}
        designH={SECTION_DESIGN_H}
        sectionClassName="mt-8"
      >
        <SectionTemplateSplit
          title={payload.title}
          beforeImages={payload.beforeImages}
          afterImages={payload.afterImages}
          onlyAfter={false}
          onlyBefore={false}
          splitDensity={payload.splitDensity}
          scopeText={payload.scopeText}
          titleScale={payload.titleScale}
          photoAreaPct={payload.photoAreaPct}
          scopeTextScale={payload.scopeTextScale}
          preview
        />
      </SlidePreviewFrame>
    );
  }
  return (
    <section className="mt-8">
      <h3 className={labelClass}>Live Preview</h3>
      <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-100/50 p-6 dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Template {layoutVariant === "heroAfter" ? "2" : "3"} placeholder — coming soon.
        </p>
      </div>
    </section>
  );
}

export function SectionPageEditor({
  sectionKey,
  sectionTitle,
  config,
  onConfigChange,
  roomMedia,
  existingPhotosForRoom,
  room = null,
  media = [],
}: SectionPageEditorProps) {
  const sections = config.pages?.sections;
  const sectionConfig = getSectionConfig(
    sections && typeof sections === "object" && !Array.isArray(sections)
      ? (sections as Record<string, SectionPageConfig>)
      : undefined,
    sectionKey
  );
  const include = sectionConfig.include !== false;
  const layoutVariant: SectionLayoutVariant =
    sectionConfig.layoutVariant ?? "split";
  const splitDensity = sectionConfig.splitDensity ?? 2;
  const titleScale = sectionConfig.titleScale ?? 1.0;
  const photoAreaPct = sectionConfig.photoAreaPct ?? 58;
  const scopeAreaPct = sectionConfig.scopeAreaPct ?? 22;
  const scopeTextScale = sectionConfig.scopeTextScale ?? 1.0;
  const featuredConceptMediaId = sectionConfig.featuredConceptMediaId ?? null;
  const beforeSelectedMediaIds = sectionConfig.beforeSelectedMediaIds ?? [];
  const afterSelectedMediaIds = sectionConfig.afterSelectedMediaIds ?? [];

  const beforeImages = useMemo(
    () => resolveBeforeImages(existingPhotosForRoom, beforeSelectedMediaIds, splitDensity),
    [existingPhotosForRoom, beforeSelectedMediaIds, splitDensity]
  );
  const afterImages = useMemo(
    () => resolveAfterImages(roomMedia, featuredConceptMediaId, afterSelectedMediaIds, splitDensity),
    [roomMedia, featuredConceptMediaId, afterSelectedMediaIds, splitDensity]
  );
  const sectionPayload: SectionTemplatePayload = useMemo(
    () => ({
      title: sectionTitle,
      scopeText: room?.scopeNarrative ?? "",
      dimensions: {
        length: formatInchesToFeetInches(room?.lengthIn ?? null),
        width: formatInchesToFeetInches(room?.widthIn ?? null),
        ceiling: formatInchesToFeetInches(room?.ceilingHeightIn ?? null),
      },
      beforeImages,
      afterImages,
      splitDensity,
      titleScale,
      photoAreaPct,
      scopeAreaPct,
      scopeTextScale,
    }),
    [sectionTitle, room?.scopeNarrative, room?.lengthIn, room?.widthIn, room?.ceilingHeightIn, beforeImages, afterImages, splitDensity, titleScale, photoAreaPct, scopeAreaPct, scopeTextScale]
  );

  const updateSection = (partial: Partial<SectionPageConfig>) => {
    const prevPages = config.pages ?? {};
    const prevSections =
      prevPages.sections &&
      typeof prevPages.sections === "object" &&
      !Array.isArray(prevPages.sections)
        ? { ...prevPages.sections }
        : {};
    const current = prevSections[sectionKey] ?? {};
    const nextDensity = partial.splitDensity ?? splitDensity;
    const nextBefore = (partial.beforeSelectedMediaIds ?? beforeSelectedMediaIds).slice(0, nextDensity);
    const nextAfter = (partial.afterSelectedMediaIds ?? afterSelectedMediaIds).slice(0, nextDensity);
    const next: SectionPageConfig = {
      include: partial.include !== undefined ? partial.include !== false : current.include !== false,
      layoutVariant: partial.layoutVariant ?? current.layoutVariant ?? "split",
      splitDensity: nextDensity,
      featuredConceptMediaId: partial.featuredConceptMediaId !== undefined ? partial.featuredConceptMediaId : (current.featuredConceptMediaId ?? null),
      beforeSelectedMediaIds: nextBefore,
      afterSelectedMediaIds: nextAfter,
      titleScale: partial.titleScale ?? titleScale,
      photoAreaPct: partial.photoAreaPct ?? photoAreaPct,
      scopeAreaPct: partial.scopeAreaPct ?? scopeAreaPct,
      scopeTextScale: partial.scopeTextScale ?? scopeTextScale,
    };
    const nextSections = { ...prevSections, [sectionKey]: next };
    onConfigChange({
      ...config,
      pages: { ...prevPages, sections: nextSections },
    });
  };

  const [trimMessageVisible, setTrimMessageVisible] = useState(false);

  function handleDensityChange(density: 1 | 2 | 3) {
    const currentBefore = sectionConfig.beforeSelectedMediaIds ?? [];
    const currentAfter = sectionConfig.afterSelectedMediaIds ?? [];
    const trimmedBefore = currentBefore.slice(0, density);
    const trimmedAfter = currentAfter.slice(0, density);

    const didTrim =
      trimmedBefore.length < currentBefore.length ||
      trimmedAfter.length < currentAfter.length;

    updateSection({
      splitDensity: density,
      beforeSelectedMediaIds: trimmedBefore,
      afterSelectedMediaIds: trimmedAfter,
    });

    if (didTrim) {
      setTrimMessageVisible(true);
      window.setTimeout(() => setTrimMessageVisible(false), 4000);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {sectionTitle}
      </h2>

      {/* A) SECTION CONTENT (shared) */}
      <section className="space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              SECTION CONTENT
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              This content is used by all Section templates; the template only
              changes the layout.
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Section Title
              </label>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
                {sectionTitle}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Scope of Work
              </label>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400 whitespace-pre-wrap min-h-[4rem]">
                {sectionPayload.scopeText || "—"}
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Edit in Sections tab.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Room Dimensions
              </label>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
                {[sectionPayload.dimensions.length, sectionPayload.dimensions.width, sectionPayload.dimensions.ceiling].every((s) => !s)
                  ? "—"
                  : `${sectionPayload.dimensions.length || "—"} × ${sectionPayload.dimensions.width || "—"} × ${sectionPayload.dimensions.ceiling || "—"}`}
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                L × W × H — edit in Sections tab.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="section-include"
                checked={include}
                onChange={(e) => updateSection({ include: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <label
                htmlFor="section-include"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Include in proposal (show as own page)
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* B) TEMPLATE (selector cards) */}
      <section className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Choose your Section template.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {SECTION_TEMPLATES.map((tpl) => {
            const selected = layoutVariant === tpl.id;
            return (
              <div
                key={tpl.id}
                className={`relative flex h-full flex-col rounded-xl border-2 p-3 text-left transition-colors ${
                  selected
                    ? "border-emerald-500 ring-2 ring-emerald-300 dark:border-emerald-400"
                    : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                } cursor-pointer`}
              >
                <button
                  type="button"
                  onClick={() =>
                    updateSection({ layoutVariant: tpl.id })
                  }
                  className="flex flex-1 flex-col text-left"
                  aria-pressed={selected}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {tpl.title}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {tpl.subtitle}
                      </p>
                    </div>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                      {tpl.id === "split" ? "1" : tpl.id === "heroAfter" ? "2" : "3"}
                    </span>
                  </div>
                  <div className="relative mt-1 aspect-video w-full overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
                    {tpl.id === "split" ? (
                      <div className="absolute inset-0 grid grid-cols-2 gap-0.5 p-1">
                        <div className="rounded bg-zinc-300 dark:bg-zinc-700" />
                        <div className="rounded bg-zinc-300 dark:bg-zinc-700" />
                        <div className="col-span-2 h-1 w-full self-center rounded bg-zinc-400 dark:bg-zinc-600" />
                        <div className="rounded bg-zinc-200 dark:bg-zinc-800" />
                        <div className="rounded bg-zinc-200 dark:bg-zinc-800" />
                      </div>
                    ) : tpl.id === "heroAfter" ? (
                      <div className="absolute inset-0 flex flex-col p-1">
                        <div className="h-2/5 rounded bg-zinc-300 dark:bg-zinc-700" />
                        <div className="mt-0.5 flex-1 rounded bg-zinc-200 dark:bg-zinc-800" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 grid grid-cols-3 gap-0.5 p-1">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="rounded border border-dashed border-zinc-400 bg-zinc-200/80 dark:border-zinc-600 dark:bg-zinc-800/80"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  {selected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm dark:bg-emerald-500">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* C) TEMPLATE SETTINGS */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Template Settings
        </h3>
        {layoutVariant === "split" ? (
          <div className="space-y-6">
            <div>
              <span className={labelClass}>Layout density</span>
              <div className="mt-2 flex flex-wrap gap-4">
                {[
                  { value: 1 as const, label: "1-Up (Large)" },
                  { value: 2 as const, label: "2-Up (Medium)" },
                  { value: 3 as const, label: "3-Up (Small)" },
                ].map(({ value, label }) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="section-split-density"
                      checked={splitDensity === value}
                      onChange={() => handleDensityChange(value)}
                      className="h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
                  </label>
                ))}
              </div>
              {trimMessageVisible && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Trimmed to match layout.
                </p>
              )}
            </div>
            <MediaThumbnailPicker
              label="Before photos (Existing photos for this room)"
              items={existingPhotosForRoom}
              selectedIds={beforeSelectedMediaIds}
              onChange={(ids) => updateSection({ beforeSelectedMediaIds: ids })}
              emptyMessage="No existing photos for this room. Add photos in the Media tab."
              maxCount={splitDensity}
            />
            <MediaThumbnailPicker
              label="After renderings (Renderings for this room)"
              items={roomMedia}
              selectedIds={afterSelectedMediaIds}
              onChange={(ids) => updateSection({ afterSelectedMediaIds: ids })}
              emptyMessage="No renderings for this room. Add renderings in the Media tab."
              maxCount={splitDensity}
            />
            {/* Live Preview + Layout Controls: 2-column so preview and sliders visible together */}
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <SectionLivePreview payload={sectionPayload} layoutVariant={layoutVariant} />
              </div>
              <div className="w-48 shrink-0 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-800/30">
                <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Layout Controls</h4>
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Title scale</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={0.85}
                        max={1.25}
                        step={0.01}
                        value={titleScale}
                        onChange={(e) => updateSection({ titleScale: parseFloat(e.target.value) || 1 })}
                        className="h-2 w-full cursor-pointer accent-zinc-900 dark:accent-zinc-300"
                      />
                      <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                        {titleScale.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Photo area % (remaining space after title + scope)</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={40}
                        max={72}
                        step={1}
                        value={photoAreaPct}
                        onChange={(e) => {
                          const photo = Math.min(72, Math.max(40, parseInt(e.target.value, 10) || 58));
                          updateSection({ photoAreaPct: photo });
                        }}
                        className="h-2 w-full cursor-pointer accent-zinc-900 dark:accent-zinc-300"
                      />
                      <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                        {photoAreaPct}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Scope text size</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={0.85}
                        max={1.25}
                        step={0.01}
                        value={scopeTextScale}
                        onChange={(e) =>
                          updateSection({
                            scopeTextScale: Math.min(1.25, Math.max(0.85, parseFloat(e.target.value) || 1)),
                          })
                        }
                        className="h-2 w-full cursor-pointer accent-zinc-900 dark:accent-zinc-300"
                      />
                      <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                        {scopeTextScale.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Scope height auto-sizes; photo area fills remaining space.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
            Template coming soon
          </div>
        )}
      </section>

      {layoutVariant !== "split" && (
        <SectionLivePreview payload={sectionPayload} layoutVariant={layoutVariant} />
      )}
    </div>
  );
}
