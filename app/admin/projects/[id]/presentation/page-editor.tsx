"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
  useState,
} from "react";
import Link from "next/link";
import type { ObjectivePageConfig, PresentationConfigSaved, PublicLayoutConfig, WhyUsPageConfig } from "@/app/lib/layout-config";
import {
  GRID_CARDS_DEFAULT_CARD_BG,
  GRID_CARDS_DEFAULT_CARD_BORDER,
  STACKED_DEFAULT_CARD_BG,
  STACKED_DEFAULT_UNDERLINE_COLOR,
  COLUMNS_DEFAULT_UNDERLINE_COLOR,
  COLUMNS_DEFAULT_ICON_COLOR,
  COLUMNS_DEFAULT_TEXT_COLOR,
} from "@/app/lib/layout-config";
import { getLayoutConfig, getTemplateCBarColor, getTemplateCColumns, getTemplateBDividerColor, getTemplateBUnderlineColor, TEMPLATE_C_DESCRIPTION_MAX_LENGTH, TEMPLATE_C_TITLE_MAX_LENGTH } from "@/app/lib/layout-config";
import type { PresentationPageId } from "./types";
import { ReorderableList } from "@/components/ui/reorderable-list";
import { LibraryMediaPicker } from "@/app/admin/settings/photo-library/library-media-picker";
import type { LibraryMediaItem } from "@/app/admin/settings/photo-library/types";
import { SECTIONS, MAX_SECTIONS } from "@/app/lib/sections";
import { COMMON_TAGS } from "@/app/lib/common-tags";
import { normalizeTag } from "@/app/lib/tag-utils";
import {
  listObjectiveSuggestedPhotosAction,
  suggestObjectiveCopyAction,
  suggestObjectivePhotoFiltersAction,
  suggestTemplateBFitStatementAction,
  suggestTemplateCColumnsAction,
  suggestTemplateCColumnAction,
  rewriteWhyUsToFitAction,
} from "./actions";
import { simpleStringHash } from "@/app/lib/string-hash";
import { CoverRenderer } from "@/components/public/cover";
import { ObjectiveRenderer, type ObjectiveMediaItem } from "@/components/public/objective";
import { ObjectiveTemplateB } from "@/app/components/presentation/objective/objective-template-b";
import { ObjectiveTemplateC } from "@/app/components/presentation/objective/objective-template-c";
import { TemplateCIconPicker } from "./template-c-icon-picker";
import { WhyUsContentEditor } from "./why-us/WhyUsContentEditor";
import { WhyUsRenderer } from "@/components/presentation/why-us/WhyUsRenderer";
import { getCompanyWhyUsDefaultsForProjectAction } from "@/app/admin/settings/presentation/value-pillars/actions";
import { SectionPageEditor } from "./section-page-editor";
import { AdditionalSectionsEditor } from "./additional-sections-editor";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const selectClass =
  "w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const inputClass =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10";
const textareaClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

type MediaOption = { id: string; url: string; kind: string; type?: string; roomId?: string | null; sortOrder?: number };
type RoomOption = {
  id: string;
  name: string;
  scopeNarrative?: string;
  lengthIn?: number | null;
  widthIn?: number | null;
  ceilingHeightIn?: number | null;
};

/** Optional cover content for live preview (project title, subtitle, coverHeroImageId). */
export type CoverContentOption = {
  title: string;
  subtitle?: string | null;
  coverHeroImageId?: string | null;
};

type PageEditorProps = {
  pageId: PresentationPageId | null;
  config: PresentationConfigSaved;
  onConfigChange: (config: PresentationConfigSaved) => void;
  media: MediaOption[];
  rooms: RoomOption[];
  /** Room IDs that have at least one concept (root rendering). */
  roomsWithConcepts: string[];
  /** Room IDs in the rollup (effective: auto = computed, manual = filtered user list). */
  rollupRoomIds: string[];
  /** Room IDs eligible for rollup (same set Auto uses; for manual checklist). */
  eligibleRollupRoomIds: string[];
  /** For room pages: concept media IDs (RENDERING) for the selected room. */
  conceptMediaByRoom: Record<string, { id: string; url: string }[]>;
  /** For cover page: project title/subtitle/coverHeroImageId for live preview. */
  coverContent?: CoverContentOption | null;
  /** Project ID (for link to Media → Front Page on cover page). */
  projectId?: string;
  /** Optional transcript + overview objective text for Objective AI helpers. */
  transcriptText?: string | null;
  overviewText?: string | null;
  /** Brand icons for Objective Template C column icon picker. */
  brandIcons?: { id: string; imageUrl: string; name?: string }[];
  /** Brand accent color. Template C bar defaults to this when barColor is unset; not persisted unless user sets bar color. */
  brandingAccentColor?: string | null;
  /** Template 4: prefetched Photo Library items so Completed Project Photos show on first load. */
  libraryPhotos?: LibraryMediaItem[];
};

/** True when Why Us has no meaningful content: no title and no pillar with headline/body/iconKey. */
function isWhyUsEmpty(config: WhyUsPageConfig | undefined): boolean {
  const title = (config?.title ?? "").trim();
  if (title !== "") return false;
  const pillars = config?.pillars;
  if (!pillars || !Array.isArray(pillars) || pillars.length === 0) return true;
  const hasAnyContent = pillars.some(
    (pillar) =>
      (pillar?.headline ?? "").trim() !== "" ||
      (pillar?.body ?? "").trim() !== "" ||
      (pillar?.iconKey ?? "") !== ""
  );
  return !hasAnyContent;
}

const DEFAULT_VISIBLE_PILLARS: readonly boolean[] = [true, true, true, false];

function getWhyUsVisiblePillars(raw: boolean[] | undefined | null): boolean[] {
  const base = [...DEFAULT_VISIBLE_PILLARS];
  if (Array.isArray(raw)) {
    raw.slice(0, 4).forEach((v, i) => {
      if (typeof v === "boolean") base[i] = v;
    });
  }
  return base;
}

const COVER_VARIANTS = [
  { id: "heroOverlay" as const, label: "Hero Overlay" },
  { id: "splitCover" as const, label: "Split Cover" },
  { id: "titlePlate" as const, label: "Title Plate" },
];

function CoverLayoutThumbnail({
  variant,
  selected,
  onSelect,
  title,
  subtitle,
}: {
  variant: (typeof COVER_VARIANTS)[number]["id"];
  selected: boolean;
  onSelect: () => void;
  title?: string;
  subtitle?: string | null;
}) {
  const t = (title ?? "").trim() || "—";
  const s = (subtitle ?? "").trim() || "—";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative aspect-video w-full overflow-hidden rounded-lg border-2 transition-colors ${
        selected
          ? "border-zinc-900 ring-2 ring-zinc-400 dark:border-zinc-100 dark:ring-zinc-500"
          : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-600 dark:hover:border-zinc-500"
      }`}
      aria-pressed={selected}
    >
      {variant === "heroOverlay" && (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-400 to-zinc-600" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-1.5 text-left">
            <div className="truncate text-[10px] font-medium text-white drop-shadow">{t}</div>
            <div className="truncate text-[8px] text-white/90">{s}</div>
          </div>
        </>
      )}
      {variant === "splitCover" && (
        <>
          <div className="absolute inset-0 grid grid-cols-2">
            <div className="bg-zinc-500" />
            <div className="flex flex-col justify-center bg-zinc-100 px-1.5 dark:bg-zinc-800">
              <div className="truncate text-[10px] font-medium text-zinc-800 dark:text-zinc-200">{t}</div>
              <div className="truncate text-[8px] text-zinc-600 dark:text-zinc-400">{s}</div>
            </div>
          </div>
        </>
      )}
      {variant === "titlePlate" && (
        <>
          <div className="absolute inset-x-0 top-0 h-2/3 bg-zinc-500" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col justify-center border-t border-zinc-200 bg-zinc-100 px-1.5 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="truncate text-[10px] font-medium text-zinc-800 dark:text-zinc-200">{t}</div>
            <div className="truncate text-[8px] text-zinc-600 dark:text-zinc-400">{s}</div>
          </div>
        </>
      )}
      {selected && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" aria-hidden>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
    </button>
  );
}

const DESIGN_W = 1200;
const DESIGN_H = 675;

type CoverLivePreviewProps = {
  mergedCoverConfig: PublicLayoutConfig["pages"]["cover"];
  media: MediaOption[];
  previewContent: {
    title: string;
    subtitle: string | null;
    badge: "Project Investment & Design Concept";
    meta: React.ReactNode;
  };
  coverHeroImageId?: string | null;
};

function CoverLivePreview({
  mergedCoverConfig,
  media,
  previewContent,
  coverHeroImageId,
}: CoverLivePreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const updateScale = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) {
        const s = Math.min(w / DESIGN_W, h / DESIGN_H, 1);
        setScale(s);
      }
    };
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    updateScale();
    return () => ro.disconnect();
  }, []);

  return (
    <section>
      <h3 className={labelClass}>Live Preview</h3>
      {/* Aspect-ratio frame: always 16:9, no overflow when browser zooms */}
      <div
        className="relative mt-2 w-full max-w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100/50 dark:border-zinc-700 dark:bg-zinc-900/50"
        style={{
          aspectRatio: "16 / 9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Inner wrapper: exactly 100% of frame; preview scales inside it */}
        <div
          ref={frameRef}
          className="absolute inset-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {/* 1200×675 design scaled to fit frame */}
          <div
            className="absolute left-1/2 top-1/2 origin-center"
            style={{
              width: DESIGN_W,
              height: DESIGN_H,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          >
            <CoverRenderer
              coverConfig={mergedCoverConfig}
              media={media.map((x) => ({ id: x.id, url: x.url, kind: x.kind, type: x.type }))}
              content={previewContent}
              coverHeroImageId={coverHeroImageId}
              preview
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const OBJECTIVE_DESIGN_W = 1200;
const OBJECTIVE_DESIGN_H = 675;
const WHY_US_DESIGN_W = 1200;
const WHY_US_DESIGN_H = 675;

type ObjectiveTemplateId = "A" | "B" | "C";

function ensureColumnsThree(
  columns: ObjectivePageConfig["columns"] | undefined
): NonNullable<ObjectivePageConfig["columns"]> {
  const base = Array.isArray(columns) ? columns.slice(0, 3) : [];
  const out = base.map((c) => ({ ...c }));
  while (out.length < 3) out.push({});
  return out;
}

type ObjectiveLivePreviewProps = {
  mergedObjectiveConfig: ObjectivePageConfig;
  media: ObjectiveMediaItem[];
  /** When "B", render Template B. When "C", render Template C (Executive Summary). Else Template A. */
  templateId?: ObjectiveTemplateId;
  /** For Template C: icon id -> image URL (from brand icons). */
  brandIcons?: { id: string; imageUrl: string; name?: string }[];
  /** Brand accent color. Template C bar / Template B underline default to this when unset. */
  brandingAccentColor?: string | null;
  /** Template B only: called when statement overflows its container (for auto-fit flow). */
  onStatementOverflow?: (overflow: boolean) => void;
};

function ObjectiveLivePreview({
  mergedObjectiveConfig,
  media,
  templateId = "A",
  brandIcons = [],
  brandingAccentColor,
  onStatementOverflow,
}: ObjectiveLivePreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const iconIdToUrl = useMemo(() => {
    const m = new Map<string, string>();
    for (const icon of brandIcons) m.set(icon.id, icon.imageUrl);
    return m;
  }, [brandIcons]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const updateScale = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) {
        const s = Math.min(
          w / OBJECTIVE_DESIGN_W,
          h / OBJECTIVE_DESIGN_H,
          1
        );
        setScale(s);
      }
    };
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    updateScale();
    return () => ro.disconnect();
  }, []);

  return (
    <section className="mt-8">
      <h3 className={labelClass}>Live Preview</h3>
      <div
        className="relative mt-2 w-full max-w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100/50 dark:border-zinc-700 dark:bg-zinc-900/50"
        style={{
          aspectRatio: "16 / 9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          ref={frameRef}
          className="absolute inset-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div
            className="absolute left-1/2 top-1/2 origin-center"
            style={{
              width: OBJECTIVE_DESIGN_W,
              height: OBJECTIVE_DESIGN_H,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          >
            {templateId === "B" ? (
              <ObjectiveTemplateB
                config={mergedObjectiveConfig}
                brandingAccentColor={brandingAccentColor}
                onStatementOverflow={onStatementOverflow}
              />
            ) : templateId === "C" ? (
              <ObjectiveTemplateC
                config={mergedObjectiveConfig}
                iconUrls={iconIdToUrl}
                preview
                brandingAccentColor={brandingAccentColor}
              />
            ) : (
              <ObjectiveRenderer
                config={mergedObjectiveConfig}
                media={media}
                preview
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

type WhyUsLivePreviewProps = {
  config: WhyUsPageConfig | undefined;
  /** Effective layout variant from merged layout config. */
  variant: PublicLayoutConfig["pages"]["whyUs"]["variant"];
  /** Brand icons (for resolving icon URLs). */
  brandIcons?: { id: string; imageUrl: string; name?: string }[];
  /** Called when gridCards body overflow is detected or cleared (for warning banner). */
  onOverflowChange?: (overflow: boolean) => void;
};

function WhyUsLivePreview({
  config,
  variant,
  brandIcons = [],
  onOverflowChange,
}: WhyUsLivePreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  /** 0 = 17px, 1 = 15px, 2 = 13px. Hard fallback so text is never cut off. */
  const [overflowStep, setOverflowStep] = useState(0);
  const iconIdToUrl = useMemo(() => {
    const m = new Map<string, string>();
    for (const icon of brandIcons) {
      if (icon.id && icon.imageUrl) m.set(icon.id, icon.imageUrl);
    }
    return m;
  }, [brandIcons]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const updateScale = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) {
        const s = Math.min(w / WHY_US_DESIGN_W, h / WHY_US_DESIGN_H, 1);
        setScale(s);
      }
    };
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    updateScale();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setOverflowStep(0);
  }, [config?.pillars, variant]);

  useLayoutEffect(() => {
    if (variant !== "gridCards") {
      onOverflowChange?.(false);
      return;
    }
    const frame = frameRef.current;
    if (!frame) return;
    const bodies = frame.querySelectorAll<HTMLElement>("[data-why-us-card-body]");
    let overflow = false;
    bodies.forEach((el) => {
      if (el.scrollHeight > el.clientHeight) overflow = true;
    });
    onOverflowChange?.(overflow);
    if (overflow) setOverflowStep((s) => Math.min(s + 1, 2));
  }, [config?.pillars, variant, overflowStep, onOverflowChange]);

  const gridCardsBodyFontSizeOverride =
    overflowStep === 0 ? undefined : 17 - overflowStep * 2;

  const mergedConfig = useMemo<WhyUsPageConfig>(
    () => ({
      ...(config ?? {}),
      variant,
    }),
    [config, variant]
  );

  return (
    <section className="mt-8">
      <h3 className={labelClass}>Live Preview</h3>
      <div
        className="relative mt-2 w-full max-w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100/50 dark:border-zinc-700 dark:bg-zinc-900/50"
        style={{
          aspectRatio: "16 / 9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          ref={frameRef}
          className="absolute inset-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div
            className="absolute left-1/2 top-1/2 origin-center"
            style={{
              width: WHY_US_DESIGN_W,
              height: WHY_US_DESIGN_H,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          >
            <WhyUsRenderer
              config={mergedConfig}
              iconUrls={iconIdToUrl}
              gridCardsBodyFontSizeOverride={gridCardsBodyFontSizeOverride}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

type ObjectiveTemplateAProps = {
  config: ObjectivePageConfig;
  onChange: (next: ObjectivePageConfig) => void;
  projectId?: string;
  transcriptText?: string | null;
  overviewText?: string | null;
};

type ObjectiveContentEditorProps = {
  config: ObjectivePageConfig;
  onChange: (next: ObjectivePageConfig) => void;
  projectId?: string;
  transcriptText?: string | null;
  overviewText?: string | null;
  /** When "C", show first field as "Executive Label (required)". */
  templateId?: ObjectiveTemplateId;
};

function ensurePhotoSlots(slots: ObjectivePageConfig["photoSlots"] | undefined) {
  const base = Array.isArray(slots) ? slots.slice(0, 3) : [];
  while (base.length < 3) base.push({});
  return base.map((slot) => ({ ...slot }));
}

function canonicalizeSections(rawSections: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const label of rawSections) {
    const lower = label.toLowerCase().trim();
    if (!lower) continue;

    let canonical: string | undefined;

    if (lower.includes("laundry")) {
      canonical = "Laundry";
    } else if (lower.includes("primary bath") || lower.includes("master bath")) {
      canonical = "Primary Bath";
    } else if (
      lower.includes("guest bath") ||
      lower.includes("jack and jill") ||
      lower.includes("jack & jill") ||
      lower.includes("hall bath") ||
      lower.includes("powder room") ||
      lower.includes("bathroom") ||
      lower.includes("bathrooms")
    ) {
      canonical = "Bathroom";
    } else {
      const exact = SECTIONS.find((s) => s.toLowerCase() === lower);
      const loose =
        exact ??
        SECTIONS.find(
          (s) => lower.includes(s.toLowerCase()) || s.toLowerCase().includes(lower)
        );
      canonical = loose;
    }

    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(canonical);
    if (result.length >= MAX_SECTIONS) break;
  }

  return result;
}

function ObjectiveContentEditor({
  config,
  onChange,
  projectId,
  transcriptText,
  overviewText,
  templateId,
}: ObjectiveContentEditorProps) {
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const latestConfigRef = useRef(config);
  const latestAiRef = useRef<NonNullable<ObjectivePageConfig["ai"]>>(
    config.ai ?? {},
  );

  useEffect(() => {
    latestConfigRef.current = config;
  }, [config]);

  useEffect(() => {
    latestAiRef.current = config.ai ?? {};
  }, [config.ai]);

  const ai = config.ai ?? {};
  const title = config.title ?? "Project Objective";
  const objectiveText = config.objectiveText ?? "";
  const commitments = (config.commitments && config.commitments.length
    ? config.commitments
    : ["", "", ""]
  ).slice(0, 3);
  while (commitments.length < 3) commitments.push("");
  const commitmentsKey = useMemo(
    () => (config.commitments ?? []).join("|"),
    [config.commitments],
  );

  const hasTranscript = !!(transcriptText && transcriptText.trim());
  const hasOverview = !!(overviewText && overviewText.trim());
  const hasAnySuggestions =
    (ai.suggestedSections?.length ?? 0) + (ai.suggestedTags?.length ?? 0) > 0;
  const transcriptChars = transcriptText?.trim().length ?? 0;
  const overviewChars = overviewText?.trim().length ?? 0;
  const suggestedObjectiveParagraph = ai.suggestedObjectiveParagraph ?? "";
  const suggestedCommitments = (ai.suggestedCommitments ?? []).slice(0, 3);
  while (suggestedCommitments.length < 3) suggestedCommitments.push("");
  const copyLastRunAt = ai.copyLastRunAt ?? ai.lastRunAt ?? null;
  const commitmentsHaveContent = commitments.some(
    (c) => (c ?? "").trim().length > 0,
  );
  const showParagraphSuggestion =
    suggestedObjectiveParagraph.trim().length > 0 &&
    !ai.copyParagraphAppliedAt &&
    !objectiveText.trim();
  const showCommitmentsSuggestion =
    suggestedCommitments.some((c) => c.trim().length > 0) &&
    !ai.copyCommitmentsAppliedAt &&
    !commitmentsHaveContent;
  const showGreenPanel = showParagraphSuggestion || showCommitmentsSuggestion;

  const autoRunRef = useRef(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const updateObjective = (partial: Partial<ObjectivePageConfig>) => {
    const next = { ...latestConfigRef.current, ...partial };
    latestConfigRef.current = next;
    latestAiRef.current = next.ai ?? {};
    onChange(next);
  };

  const updateAi = (partial: Partial<NonNullable<ObjectivePageConfig["ai"]>>) =>
    updateObjective({
      ai: {
        ...latestAiRef.current,
        ...partial,
      },
    });

  const runCopySuggestions = useCallback(async () => {
    if (!projectId) return;

    const hasTranscriptNow = !!(transcriptText && transcriptText.trim());
    const hasOverviewNow = !!(overviewText && overviewText.trim());

    if (!hasTranscriptNow && !hasOverviewNow) {
      setCopyError(
        "Add transcript or objective text (Overview tab) to run AI copy.",
      );
      return;
    }

    setCopyLoading(true);
    setCopyError(null);
    try {
      const result = await suggestObjectiveCopyAction({
        projectId,
        transcriptText,
        overviewText,
      });

      updateAi({
        suggestedObjectiveParagraph: result.objectiveParagraph,
        suggestedCommitments: result.commitments.slice(0, 3),
        copyLastRunAt: new Date().toISOString(),
      });

      // When Template C is active, also refresh the shared subtitle
      // unless the subtitle is locked.
      if (templateId === "C") {
        const current = latestConfigRef.current;
        const subtitleLocked = current.templateC?.subtitleLocked === true;
        if (!subtitleLocked) {
          const tcResult = await suggestTemplateCColumnsAction({
            projectId,
            objectiveTitle: current.title,
            objectiveText: current.objectiveText,
            transcriptText,
            overviewText,
          });
          if (!("error" in tcResult)) {
            const nextTc = {
              ...current.templateC,
              barColor: current.templateC?.barColor ?? undefined,
              columns: getTemplateCColumns(current),
            };
            updateObjective({
              subtitle: tcResult.subtitle ?? "",
              templateC: nextTc,
            });
          }
        }
      }
    } catch (e) {
      setCopyError(
        e instanceof Error
          ? e.message
          : "Failed to load AI copy suggestions.",
      );
    } finally {
      setCopyLoading(false);
    }
  }, [
    projectId,
    transcriptText,
    overviewText,
    updateAi,
    templateId,
    updateObjective,
  ]);

  // Auto-run once when Objective page first loads and AI has never run,
  // user has not applied AI copy, and chosen fields are still empty.
  useEffect(() => {
    if (autoRunRef.current) return;
    if (!projectId) return;
    if (copyLastRunAt) return;
    if (ai.appliedAt) return;

    const chosenObjectiveEmpty = !(config.objectiveText?.trim());
    const chosenCommitmentsEmpty = (config.commitments ?? []).every(
      (c) => !(c?.trim()),
    );
    if (!chosenObjectiveEmpty || !chosenCommitmentsEmpty) return;

    const hasTranscriptNow = !!(transcriptText && transcriptText.trim());
    const hasOverviewNow = !!(overviewText && overviewText.trim());
    if (!hasTranscriptNow && !hasOverviewNow) return;

    autoRunRef.current = true;
    void runCopySuggestions();
  }, [
    projectId,
    transcriptText,
    overviewText,
    copyLastRunAt,
    ai.appliedAt,
    config.objectiveText,
    commitmentsKey,
    runCopySuggestions,
  ]);

  const handleApplySuggestedParagraph = () => {
    const suggestion = suggestedObjectiveParagraph.trim();
    if (!suggestion) return;
    const current = (objectiveText ?? "").trim();
    const now = new Date().toISOString();
    const nextAi = { ...ai, copyParagraphAppliedAt: now, appliedAt: now };
    if (!current) {
      updateObjective({
        objectiveText: suggestion,
        ai: nextAi,
      });
      setToast("Objective paragraph applied.");
      return;
    }
    if (
      typeof window === "undefined" ||
      window.confirm(
        "Replace existing objective paragraph with AI suggestion?",
      )
    ) {
      updateObjective({
        objectiveText: suggestion,
        ai: nextAi,
      });
      setToast("Objective paragraph replaced with AI suggestion.");
    }
  };

  const handleApplySuggestedCommitments = () => {
    const cleanedSuggestions = suggestedCommitments
      .map((c) => c.trim())
      .filter(Boolean);
    if (!cleanedSuggestions.length) return;
    const currentTrimmed = commitments.map((c) => c.trim());
    const hasExisting = currentTrimmed.some((c) => c.length > 0);
    const next = [...cleanedSuggestions].slice(0, 3);
    while (next.length < 3) next.push("");
    const now = new Date().toISOString();
    const nextAi = { ...ai, copyCommitmentsAppliedAt: now, appliedAt: now };
    if (!hasExisting) {
      updateObjective({
        commitments: next,
        ai: nextAi,
      });
      setToast("Commitments applied from AI suggestions.");
      return;
    }
    if (
      typeof window === "undefined" ||
      window.confirm("Replace existing commitments with AI suggestions?")
    ) {
      updateObjective({
        commitments: next,
        ai: nextAi,
      });
      setToast("Commitments replaced with AI suggestions.");
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Objective Content
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              This content is used by all Objective templates; the template only changes the layout.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={runCopySuggestions}
              disabled={!projectId || copyLoading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {copyLoading
                ? "Running…"
                : copyLastRunAt
                  ? templateId === "C"
                    ? "Re-run AI Copy + Subtitle"
                    : "Re-run AI Copy"
                  : templateId === "C"
                    ? "Run AI Copy + Subtitle"
                    : "Run AI Copy"}
            </button>
          </div>
        </div>
        {showGreenPanel ? (
          <div className="mb-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/70 p-3 text-xs dark:border-emerald-700 dark:bg-emerald-900/30">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-semibold text-emerald-900 dark:text-emerald-100">
                Suggested objective & commitments (AI)
              </p>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-800 dark:text-emerald-50">
                Preview only – click Apply to use
              </span>
            </div>
            <div className="space-y-2">
              {showParagraphSuggestion ? (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-emerald-900 dark:text-emerald-50">
                      Suggested Objective Paragraph
                    </p>
                    <button
                      type="button"
                      onClick={handleApplySuggestedParagraph}
                      className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
                    >
                      Apply to paragraph
                    </button>
                  </div>
                  <p className="rounded-md bg-white/80 px-2.5 py-2 text-[11px] leading-relaxed text-emerald-950 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-50">
                    {suggestedObjectiveParagraph}
                  </p>
                </div>
              ) : null}
              {showCommitmentsSuggestion ? (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-emerald-900 dark:text-emerald-50">
                      Suggested Commitments
                    </p>
                    <button
                      type="button"
                      onClick={handleApplySuggestedCommitments}
                      className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
                    >
                      Apply to commitments
                    </button>
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-emerald-950 dark:text-emerald-50">
                    {suggestedCommitments.map((c, idx) =>
                      c.trim() ? (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span>{c}</span>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="space-y-3">
          <div>
            <label
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              htmlFor="objective-title"
            >
              {templateId === "C" ? "Executive Label (required)" : "Title"}
            </label>
            <input
              id="objective-title"
              type="text"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={title}
              onChange={(e) => updateObjective({ title: e.target.value })}
              placeholder={templateId === "C" ? "e.g. Executive Summary" : "Project objective"}
            />
            {templateId === "C" && !(title ?? "").trim() && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400" role="alert">
                Executive Label is required for Template C.
              </p>
            )}
          </div>
          {templateId === "C" ? (
            <div>
              <div className="mb-1 flex items-center gap-2">
                <label
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  htmlFor="objective-subtitle"
                >
                  Subtitle
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={config.templateC?.subtitleLocked === true}
                    onChange={(e) =>
                      updateObjective({
                        templateC: {
                          ...config.templateC,
                          barColor: config.templateC?.barColor ?? undefined,
                          columns: getTemplateCColumns(config),
                          subtitleLocked: e.target.checked,
                        },
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600"
                  />
                  Lock (don’t overwrite on AI run)
                </label>
              </div>
              <input
                id="objective-subtitle"
                type="text"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                value={config.subtitle ?? ""}
                onChange={(e) =>
                  updateObjective({
                    subtitle: e.target.value,
                  })
                }
                placeholder="Optional line above main title (4–10 words)."
              />
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                When Template C is selected, the top &quot;AI Copy&quot; button can automatically fill this subtitle. Lock it to keep your custom text.
              </p>
            </div>
          ) : null}
          <div>
            <label
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              htmlFor="objective-text"
            >
              Objective paragraph
            </label>
            <textarea
              id="objective-text"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              rows={4}
              value={objectiveText}
              onChange={(e) =>
                updateObjective({ objectiveText: e.target.value })
              }
              placeholder="Summarize the project objective in 2–3 concise sentences."
            />
          </div>
        </div>
        <div className="mt-4 space-y-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <p>
            Transcript:{" "}
            <span className="font-medium">
              {hasTranscript ? `Present (${transcriptChars} chars)` : "Empty (0)"}
            </span>{" "}
            · Overview:{" "}
            <span className="font-medium">
              {hasOverview ? `Present (${overviewChars} chars)` : "Empty (0)"}
            </span>{" "}
            · lastRunAt:{" "}
            <span className="font-mono">{copyLastRunAt ?? "null"}</span>
          </p>
          {copyError && (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              Copy: {copyError}
            </p>
          )}
          {!hasTranscript && !hasOverview && (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
              Add transcript or objective text (Overview tab) to enable AI
              suggestions.
            </p>
          )}
          {ai.appliedAt && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Locked (AI copy applied on{" "}
              <span className="font-mono">
                {new Date(ai.appliedAt).toLocaleString()}
              </span>
              ). Auto-run is disabled until you reset the lock.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Key Commitments
        </p>
        <p className="mb-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Three concise promises you’re making to the client.
        </p>
        <div className="space-y-2">
          {commitments.map((value, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">
                {idx + 1}
              </span>
              <input
                type="text"
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                value={value}
                onChange={(e) => {
                  const next = commitments.slice();
                  next[idx] = e.target.value;
                  updateObjective({ commitments: next });
                }}
                placeholder="Short commitment"
              />
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 transform rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {toast}
        </div>
      )}
    </section>
  );
}

function ObjectiveTemplateAEditor({
  config,
  onChange,
  projectId,
  transcriptText,
  overviewText,
}: ObjectiveTemplateAProps) {
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);
  // Objective photo suggestions use full library (no hero-only filter).
  const heroOnly = false;
  const [suggestedPhotosLoading, setSuggestedPhotosLoading] = useState(false);
  const [photos, setPhotos] = useState<LibraryMediaItem[]>([]);
  const [knownMedia, setKnownMedia] = useState<Record<string, LibraryMediaItem>>(
    {}
  );
  const [aiTab, setAiTab] = useState<"filters" | "photos">("filters");
  const [sectionToAdd, setSectionToAdd] = useState<string>("");
  const photoAutoRunRef = useRef(false);
  const photoForceRef = useRef(false);
  const photosRequestIdRef = useRef(0);
  const latestConfigRef = useRef(config);
  const latestAiRef = useRef<NonNullable<ObjectivePageConfig["ai"]>>(config.ai ?? {});

  useEffect(() => {
    latestConfigRef.current = config;
  }, [config]);

  useEffect(() => {
    latestAiRef.current = config.ai ?? {};
  }, [config.ai]);

  const ai = config.ai ?? {};
  const sections = ai.suggestedSections ?? [];
  const tags = ai.suggestedTags ?? [];
  const sectionsKey = sections.slice(0, 3).join("|");
  const tagsKey = tags.slice(0, 10).join("|");

  const sectionChips = useMemo(
    () =>
      [...sections].sort((a, b) => a.localeCompare(b)),
    [sections]
  );
  const tagChips = useMemo(
    () =>
      [...tags].sort((a, b) => a.localeCompare(b)),
    [tags]
  );

  const photosIdsRef = useRef<string>("");
  const hasProject = !!projectId;

  const hasTranscript = !!(transcriptText && transcriptText.trim());
  const hasOverview = !!(overviewText && overviewText.trim());
  const hasAnySuggestions = (sections.length + tags.length) > 0;
  const transcriptChars = transcriptText?.trim().length ?? 0;
  const overviewChars = overviewText?.trim().length ?? 0;
  const copyLastRunAt = ai.copyLastRunAt ?? ai.lastRunAt ?? null;
  const photoLastRunAt = ai.photoLastRunAt ?? null;

  const updateObjective = (partial: Partial<ObjectivePageConfig>) => {
    const next = { ...latestConfigRef.current, ...partial };
    latestConfigRef.current = next;
    latestAiRef.current = next.ai ?? {};
    onChange(next);
  };

  const updateAi = (partial: Partial<NonNullable<ObjectivePageConfig["ai"]>>) => {
    updateObjective({
      ai: {
        ...latestAiRef.current,
        ...partial,
      },
    });
  };

  const runPhotoSuggestions = useCallback(async () => {
    if (!projectId) return;

    const hasTranscriptNow = !!(transcriptText && transcriptText.trim());
    const hasOverviewNow = !!(overviewText && overviewText.trim());

    if (!hasTranscriptNow && !hasOverviewNow) {
      setPhotosError("Add transcript or objective text (Overview tab) to run AI photos.");
      return;
    }

    setPhotosLoading(true);
    setPhotosError(null);
    try {
      const filterResult = await suggestObjectivePhotoFiltersAction({
        projectId,
        transcriptText,
        overviewText,
      });
      // eslint-disable-next-line no-console
      console.debug("[Filters] raw sections=", filterResult.sections, "raw tags=", filterResult.tags);

      const force = photoForceRef.current === true;
      if (force) {
        photoForceRef.current = false;
      }

      const canonicalSections = canonicalizeSections(filterResult.sections ?? []);
      const existingSections = sections;
      const suggestedSections =
        force || canonicalSections.length > 0 ? canonicalSections : existingSections;
      const suggestedTags = filterResult.tags.slice(0, 10);

      const photoResult = await listObjectiveSuggestedPhotosAction({
        projectId,
        sections: suggestedSections,
        tags: suggestedTags,
        heroOnly: false,
        limit: 24,
      });

      const topIds = photoResult.topIds ?? [];
      const top3 = topIds.slice(0, 3);
      const slots = ensurePhotoSlots(config.photoSlots).map((slot, i) => ({
        ...slot,
        libraryMediaId: top3[i] ?? slot.libraryMediaId,
      }));

      const nextAi = {
        ...latestAiRef.current,
        suggestedSections,
        suggestedTags,
        suggestedPhotoIds: topIds.length > 0 ? topIds : undefined,
        photoLastRunAt: new Date().toISOString(),
      };
      // Dev log for Objective AI Photos runs
      // eslint-disable-next-line no-console
      console.debug(
        "[Objective AI Photos] sectionsSaved",
        suggestedSections,
        "tagsSaved",
        suggestedTags,
        "topIds",
        topIds.slice(0, 3)
      );
      updateObjective({ ai: nextAi, photoSlots: slots });
      if (photoResult.items?.length) {
        photosIdsRef.current = photoResult.items.map((m) => m.id).join("|");
        setPhotos(photoResult.items);
        setKnownMedia((prev) => {
          const next = { ...prev };
          for (const item of photoResult.items) next[item.id] = item;
          return next;
        });
      }
    } catch (e) {
      setPhotosError(
        e instanceof Error ? e.message : "Failed to load AI photo suggestions.",
      );
    } finally {
      setPhotosLoading(false);
    }
  }, [projectId, transcriptText, overviewText, updateObjective, config.photoSlots, sections]);

  // Optionally auto-run AI photos on first load when collage is empty and we have transcript/overview.
  useEffect(() => {
    if (photoAutoRunRef.current) return;
    if (!projectId) return;
    if (photoLastRunAt) return;
    const slots = ensurePhotoSlots(config.photoSlots);
    const allSlotsEmpty = slots.every((s) => !s.libraryMediaId);
    if (!allSlotsEmpty) return;
    const hasInput = !!(transcriptText?.trim() || overviewText?.trim());
    if (!hasInput) return;
    photoAutoRunRef.current = true;
    void runPhotoSuggestions();
  }, [projectId, transcriptText, overviewText, photoLastRunAt, config.photoSlots, runPhotoSuggestions]);

  // Fetch Suggested Photos from global LibraryMedia whenever filters change.
  useEffect(() => {
    const requestId = ++photosRequestIdRef.current;
    let cancelled = false;
    const fetchPhotos = async () => {
      setSuggestedPhotosLoading(true);
      try {
        const result = await listObjectiveSuggestedPhotosAction({
          sections,
          tags,
          heroOnly,
          limit: 24,
        });
        if (cancelled || requestId !== photosRequestIdRef.current) return;
        const newIdsKey = result.items.map((item) => item.id).join("|");
        if (newIdsKey !== photosIdsRef.current) {
          photosIdsRef.current = newIdsKey;
          setPhotos(result.items);
        }
        // Track known media for slot thumbnails.
        setKnownMedia((prev) => {
          if (cancelled || requestId !== photosRequestIdRef.current) return prev;
          const next = { ...prev };
          for (const item of result.items) next[item.id] = item;
          return next;
        });
        if (result.topIds && result.topIds.length && requestId === photosRequestIdRef.current && !cancelled) {
          // eslint-disable-next-line no-console
          console.debug("[Effect] before suggestedPhotoIds merge ai=", latestAiRef.current);
          updateAi({ suggestedPhotoIds: result.topIds });
        }
      } catch (e) {
        if (cancelled || requestId !== photosRequestIdRef.current) return;
        setPhotos([]);
      } finally {
        if (!cancelled && requestId === photosRequestIdRef.current) {
          setSuggestedPhotosLoading(false);
        }
      }
    };
    void fetchPhotos();
    return () => {
      cancelled = true;
    };
  }, [sectionsKey, tagsKey, heroOnly]);

  const photoSlots = ensurePhotoSlots(config.photoSlots);

  const mergedObjectiveConfig = useMemo(
    () => ({ ...config, variant: config.variant ?? "twoColGallery" }),
    [config]
  );
  const objectiveMedia = useMemo(() => {
    const slots = (config.photoSlots ?? []).slice(0, 3);
    return slots
      .map((s) => s?.libraryMediaId)
      .filter((id): id is string => !!id)
      .map((id) => ({
        id,
        url: knownMedia[id]?.url ?? knownMedia[id]?.thumbnailUrl ?? "",
      }))
      .filter((m) => (m.url ?? "").trim() !== "");
  }, [config.photoSlots, knownMedia]);

  const handleApplySuggestedPhotos = () => {
    const suggestedIds = (ai.suggestedPhotoIds ?? []).slice(0, 3);
    if (!suggestedIds.length) return;

    const current = ensurePhotoSlots(config.photoSlots);
    const nextSlots = current.map((slot) => ({ ...slot }));
    for (let i = 0; i < Math.min(3, suggestedIds.length); i += 1) {
      if (suggestedIds[i]) {
        nextSlots[i]!.libraryMediaId = suggestedIds[i]!;
      }
    }
    updateObjective({ photoSlots: nextSlots });
  };

  const handleSlotRemove = (index: number) => {
    const slots = ensurePhotoSlots(config.photoSlots);
    slots[index] = { ...slots[index], libraryMediaId: undefined };
    updateObjective({ photoSlots: slots });
  };

  const openSlotPicker = (index: number) => {
    // This is handled by rendering a LibraryMediaPicker wired to this index.
    // No-op here; see inline picker usage below.
  };

  const [pickerState, setPickerState] = useState<{
    open: boolean;
    slotIndex: number | null;
    fromSuggestedPanel?: boolean;
  }>({ open: false, slotIndex: null, fromSuggestedPanel: false });

  const startPickerForSlot = (slotIndex: number) => {
    setPickerState({ open: true, slotIndex, fromSuggestedPanel: false });
  };

  const startPickerFromPanel = () => {
    // Choose first empty slot, or slot 0 if all full.
    const slots = ensurePhotoSlots(config.photoSlots);
    const emptyIndex = slots.findIndex((s) => !s.libraryMediaId);
    setPickerState({
      open: true,
      slotIndex: emptyIndex >= 0 ? emptyIndex : 0,
      fromSuggestedPanel: true,
    });
  };

  const handlePickerSelect = (selected: LibraryMediaItem[]) => {
    const slotIndex = pickerState.slotIndex;
    if (slotIndex == null) return;
    const item = selected[0];
    if (!item) return;
    setKnownMedia((prev) => ({ ...prev, [item.id]: item }));
    const slots = ensurePhotoSlots(config.photoSlots);
    slots[slotIndex] = { ...slots[slotIndex], libraryMediaId: item.id };
    updateObjective({ photoSlots: slots });
  };

  const variant = config.variant ?? "twoColGallery";

  return (
    <div className="mt-4 space-y-6">
      {/* Template A specific settings (photos + preview) */}
      <section className="space-y-4">
        {/* AI filters + Suggested photos card */}
        <div className="rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                AI Suggestions
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Uses your transcript and overview to suggest filters and photos.
              </p>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full bg-zinc-100 p-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <button
                type="button"
                onClick={() => setAiTab("filters")}
                className={`rounded-full px-2 py-0.5 font-medium ${
                  aiTab === "filters"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                    : "hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                AI Filters
              </button>
              <button
                type="button"
                onClick={() => setAiTab("photos")}
                className={`rounded-full px-2 py-0.5 font-medium ${
                  aiTab === "photos"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                    : "hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                Suggested Photos
              </button>
            </div>
          </div>

          <div className="mt-4">
            {aiTab === "filters" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">
                      Status:{" "}
                      <span className="font-normal text-zinc-600 dark:text-zinc-400">
                        {!projectId
                          ? "Connect project to use AI suggestions."
                          : !hasTranscript && !hasOverview
                            ? "AI suggestions are disabled until you add transcript or objective text."
                            : !copyLastRunAt && (hasTranscript || hasOverview)
                              ? "Ready to run – click Run AI Copy or wait for auto-run."
                              : hasAnySuggestions
                                ? "AI suggestions ready."
                                : "No suggestions yet for current inputs."}
                      </span>
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Transcript:{" "}
                      <span className="font-medium">
                        {hasTranscript
                          ? `Present (${transcriptChars} chars)`
                          : "Empty (0)"}
                      </span>{" "}
                      · Overview:{" "}
                      <span className="font-medium">
                        {hasOverview
                          ? `Present (${overviewChars} chars)`
                          : "Empty (0)"}
                      </span>{" "}
                      · lastRunAt:{" "}
                      <span className="font-mono">
                        {copyLastRunAt ?? "null"}
                      </span>
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      copyLastRunAt:{" "}
                      <span className="font-mono">
                        {copyLastRunAt ?? "null"}
                      </span>{" "}
                      · photoLastRunAt:{" "}
                      <span className="font-mono">
                        {photoLastRunAt ?? "null"}
                      </span>
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold">Run AI Copy / Photos</span> updates the suggestions in this panel only.
                      <span className="ml-1 font-semibold">Apply</span> writes AI copy into the page and locks auto-run until you reset it.
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Debug – transcript length:{" "}
                      <span className="font-mono">{transcriptChars}</span>{" "}
                      · overview length:{" "}
                      <span className="font-mono">{overviewChars}</span>
                    </p>
                    {ai.appliedAt && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        Locked (AI copy applied on{" "}
                        <span className="font-mono">
                          {new Date(ai.appliedAt).toLocaleString()}
                        </span>
                        ). Auto-run is disabled until you reset the lock.
                      </p>
                    )}
                    {photosError && (
                      <p className="text-[11px] text-red-600 dark:text-red-400">
                        Photos: {photosError}
                      </p>
                    )}
                    {!hasTranscript && !hasOverview && (
                      <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                        Add transcript or objective text (Overview tab) to enable AI
                        suggestions.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={runPhotoSuggestions}
                        disabled={!projectId || photosLoading}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {photosLoading
                          ? "Running…"
                          : photoLastRunAt
                            ? "Re-run AI Photos"
                            : "Run AI Photos"}
                      </button>
                      {photoLastRunAt && (
                        <button
                          type="button"
                          onClick={() => {
                            photoForceRef.current = true;
                            void runPhotoSuggestions();
                          }}
                          className="text-[11px] font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                        >
                          Force re-run Photos
                        </button>
                      )}
                    </div>
                  </div>
                  {ai.appliedAt && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          typeof window === "undefined" ||
                          window.confirm(
                            "Reset AI lock and allow Objective AI to auto-run again?"
                          )
                        ) {
                          updateObjective({
                            ai: {
                              ...ai,
                              appliedAt: null,
                              appliedHash: null,
                              copyParagraphAppliedAt: null,
                              copyCommitmentsAppliedAt: null,
                            },
                          });
                        }
                      }}
                      className="text-[11px] font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                    >
                      Reset AI Lock
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Sections
                    </p>
                    {sectionChips.length === 0 ? (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        No sections yet. Run AI suggestions or add sections manually.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {sectionChips.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
                          >
                            {s}
                            <button
                              type="button"
                              className="rounded-full p-0.5 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                              onClick={() =>
                                updateAi({
                                  suggestedSections: (ai.suggestedSections ?? []).filter(
                                    (x) => x !== s
                                  ),
                                })
                              }
                              aria-label={`Remove ${s}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="text-zinc-500 dark:text-zinc-400">
                        Add section
                      </span>
                      <select
                        value={sectionToAdd}
                        onChange={(e) => setSectionToAdd(e.target.value)}
                        disabled={sections.length >= MAX_SECTIONS}
                        className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-[11px] text-zinc-800 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value="">
                          {sections.length >= MAX_SECTIONS
                            ? "Max sections reached"
                            : "Choose section…"}
                        </option>
                        {SECTIONS.filter(
                          (s) => !sections.includes(s)
                        ).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={
                          !sectionToAdd ||
                          sections.length >= MAX_SECTIONS
                        }
                        onClick={() => {
                          if (
                            !sectionToAdd ||
                            sections.includes(sectionToAdd) ||
                            sections.length >= MAX_SECTIONS
                          ) {
                            return;
                          }
                          const nextSections = [
                            ...sections,
                            sectionToAdd,
                          ].slice(0, MAX_SECTIONS);
                          updateAi({ suggestedSections: nextSections });
                          setSectionToAdd("");
                        }}
                        className="rounded-md bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Tags
                    </p>
                    {tagChips.length === 0 ? (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        No tags yet. Run AI suggestions.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {tagChips.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
                          >
                            {t}
                            <button
                              type="button"
                              className="rounded-full p-0.5 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                              onClick={() => {
                                const targetNorm = normalizeTag(t);
                                updateAi({
                                  suggestedTags: (ai.suggestedTags ?? []).filter(
                                    (x) => normalizeTag(x) !== targetNorm
                                  ),
                                });
                              }}
                              aria-label={`Remove ${t}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Suggested photos are filtered by sections and tags (full library, no hero-only filter).
                </p>
                <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                  Debug: sections={sections.length} tags={tags.length} suggestedPhotoIds={(ai.suggestedPhotoIds ?? []).length} photoSlotsFilled={photoSlots.filter((s) => s.libraryMediaId).length}
                </p>

                <div className="space-y-3">
                  {suggestedPhotosLoading ? (
                    <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Loading suggested photos…
                    </p>
                  ) : photos.length === 0 ? (
                    sections.length === 0 ? (
                      <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Add sections (manually or via AI) to load suggested photos.
                      </p>
                    ) : (
                      <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">
                        No suggested photos yet. Adjust sections or tags, then run AI
                        suggestions.
                      </p>
                    )
                  ) : (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                      {photos.map((item) => {
                        const imgUrl = item.thumbnailUrl ?? item.url;
                        const isSelected = photoSlots.some(
                          (slot) => slot.libraryMediaId === item.id
                        );
                        return (
                          <div
                            key={item.id}
                            className={`relative aspect-[4/3] overflow-hidden rounded-lg border text-xs ${
                              isSelected
                                ? "border-emerald-500 ring-2 ring-emerald-500"
                                : "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imgUrl}
                              alt={item.title ?? "Suggested photo"}
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
                              <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                Suggested
                              </span>
                              {item.quality === "HERO_READY" && (
                                <span className="rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                  HERO
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleApplySuggestedPhotos}
                      disabled={
                        suggestedPhotosLoading ||
                        (!photos.length && !(ai.suggestedPhotoIds?.length))
                      }
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Apply Suggested Photos to Collage
                    </button>
                    <button
                      type="button"
                      onClick={startPickerFromPanel}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Open Full Library
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Photo Collage – directly above live preview */}
        <div className="rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Photo Collage
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Select up to 3 photos used in the Objective collage.
              </p>
            </div>
            <button
              type="button"
              onClick={handleApplySuggestedPhotos}
              disabled={
                suggestedPhotosLoading ||
                (!photos.length && !(ai.suggestedPhotoIds?.length))
              }
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Apply Suggested Photos
            </button>
          </div>
          <div className="grid grid-cols-3 items-stretch gap-2 sm:gap-3">
            {[0, 1, 2].map((index) => {
              const slot = photoSlots[index];
              const mediaId = slot?.libraryMediaId;
              const item = mediaId ? knownMedia[mediaId] : undefined;
              const thumbUrl = item?.thumbnailUrl ?? item?.url ?? null;
              const label = index === 0 ? "Featured" : `Photo ${index + 1}`;
              return (
                <div
                  key={index}
                  className="flex min-w-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-800/30"
                >
                  <p className="mb-1 shrink-0 px-1 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                    {label}
                  </p>
                  <div className="relative h-16 min-h-0 w-full flex-1 overflow-hidden rounded border border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 sm:h-20">
                    {thumbUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400 dark:text-zinc-500">
                        Choose
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 flex shrink-0 flex-nowrap gap-1">
                    <button
                      type="button"
                      onClick={() => startPickerForSlot(index)}
                      className="shrink-0 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {mediaId ? "Replace" : "Choose"}
                    </button>
                    {mediaId && (
                      <button
                        type="button"
                        onClick={() => handleSlotRemove(index)}
                        className="shrink-0 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <ObjectiveLivePreview
        mergedObjectiveConfig={mergedObjectiveConfig}
        media={objectiveMedia}
      />

      <LibraryMediaPicker
        open={pickerState.open}
        onClose={() =>
          setPickerState({ open: false, slotIndex: null, fromSuggestedPanel: false })
        }
        onSelect={handlePickerSelect}
        multiple={false}
        mode="all"
        includeUnapproved={true}
        initialFilters={{
          roomTypeIds: sectionChips.length ? sectionChips : undefined,
          sort: "newest",
          pageSize: 24,
        }}
      />
    </div>
  );
}

type ObjectiveTemplateBEditorProps = {
  config: ObjectivePageConfig;
  onChange: (next: ObjectivePageConfig) => void;
  projectId?: string;
  transcriptText?: string | null;
  overviewText?: string | null;
  /** Brand accent color for Template B underline default. */
  brandingAccentColor?: string | null;
};

function ObjectiveTemplateBEditor({
  config,
  onChange,
  projectId,
  brandingAccentColor,
}: ObjectiveTemplateBEditorProps) {
  const mergedObjectiveConfig = useMemo(() => ({ ...config }), [config]);
  const underlineColor = getTemplateBUnderlineColor(config, brandingAccentColor);
  const dividerColor = getTemplateBDividerColor(config);

  const [statementOverflow, setStatementOverflow] = useState(false);
  const [fitLoading, setFitLoading] = useState(false);
  const [fitError, setFitError] = useState<string | null>(null);
  const lastAutoFitHashRef = useRef<string | null>(null);

  const baseText = (config.objectiveText ?? "").trim();
  const objectiveTextB = (config.objectiveTextB ?? "").trim();
  const sourceHash = simpleStringHash(baseText);
  const storedSourceHash = config.templateB?.objectiveTextBSourceHash ?? null;
  const alreadyRanForThisBase = storedSourceHash === sourceHash && objectiveTextB.length > 0;
  const shouldShowFitAgain = statementOverflow && alreadyRanForThisBase;

  const handleStatementOverflow = useCallback(
    (overflow: boolean) => {
      setStatementOverflow(overflow);
      if (!overflow) return;
      // Auto-run fit at most once per base text (when B override empty or source changed).
      const needsFit =
        !objectiveTextB || storedSourceHash !== sourceHash;
      const canAutoRun =
        needsFit &&
        lastAutoFitHashRef.current !== sourceHash &&
        baseText.length > 0 &&
        projectId;
      if (!canAutoRun) return;
      lastAutoFitHashRef.current = sourceHash;
      setFitError(null);
      setFitLoading(true);
      void suggestTemplateBFitStatementAction({ projectId: projectId!, objectiveText: baseText })
        .then((result) => {
          if ("error" in result) {
            setFitError(result.error);
            lastAutoFitHashRef.current = null;
            return;
          }
          const now = new Date().toISOString();
          onChange({
            ...config,
            objectiveTextB: result.fitStatement,
            templateB: {
              ...config.templateB,
              underlineColor: config.templateB?.underlineColor,
              dividerColor: config.templateB?.dividerColor,
              objectiveTextBLastFitAt: now,
              objectiveTextBSourceHash: sourceHash,
            },
          });
        })
        .finally(() => setFitLoading(false));
    },
    [
      baseText,
      config,
      objectiveTextB,
      sourceHash,
      storedSourceHash,
      projectId,
      onChange,
    ]
  );

  const runFitCopy = useCallback(async () => {
    if (!projectId || !baseText) {
      setFitError("Objective paragraph is required.");
      return;
    }
    setFitError(null);
    setFitLoading(true);
    try {
      const result = await suggestTemplateBFitStatementAction({
        projectId,
        objectiveText: baseText,
      });
      if ("error" in result) {
        setFitError(result.error);
        return;
      }
      const now = new Date().toISOString();
      onChange({
        ...config,
        objectiveTextB: result.fitStatement,
        templateB: {
          ...config.templateB,
          underlineColor: config.templateB?.underlineColor,
          dividerColor: config.templateB?.dividerColor,
          objectiveTextBLastFitAt: now,
          objectiveTextBSourceHash: sourceHash,
        },
      });
    } finally {
      setFitLoading(false);
    }
  }, [projectId, baseText, config, sourceHash, onChange]);

  const setUnderlineColor = (value: string) => {
    const hex = value.trim() && /^#[0-9A-Fa-f]{6}$/.test(value.trim()) ? value.trim() : undefined;
    onChange({ ...config, templateB: { ...config.templateB, underlineColor: hex } });
  };
  const setDividerColor = (value: string) => {
    const hex = value.trim() && /^#[0-9A-Fa-f]{6}$/.test(value.trim()) ? value.trim() : undefined;
    onChange({ ...config, templateB: { ...config.templateB, dividerColor: hex } });
  };
  const resetToDefaults = () => {
    onChange({
      ...config,
      templateB: {
        underlineColor: undefined,
        dividerColor: undefined,
      },
    });
  };

  return (
    <div className="mt-4 space-y-6">
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white/80 p-4 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <p className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Template B — Statement + 3 Pillars
        </p>
        <p className="text-zinc-500 dark:text-zinc-400">
          Template B uses a shorter statement for layout. Uses the shared Objective Content (title, paragraph, commitments) and renders them in a centered serif layout with three pillars.
        </p>
      </section>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Template B statement (fit copy)
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Shorter statement used only by Template B so the text fits without truncation. If empty, it will be generated automatically when the main paragraph overflows, or use the button below.
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Template B statement override
          </label>
          <textarea
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            rows={2}
            value={config.objectiveTextB ?? ""}
            onChange={(e) =>
              onChange({ ...config, objectiveTextB: e.target.value || undefined })
            }
            placeholder="20–36 words, single paragraph. Generated automatically if needed."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runFitCopy}
            disabled={fitLoading || !projectId || !baseText}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {fitLoading ? "Generating…" : "Regenerate Fit Copy"}
          </button>
          {shouldShowFitAgain && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Statement still overflows; click Regenerate Fit Copy to try again.
            </span>
          )}
          {fitError && (
            <p className="text-xs text-red-600 dark:text-red-400">{fitError}</p>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Template B styling
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Underline and column divider colors. Defaults: accent for underline, light gray for dividers.
        </p>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Underline color
            </label>
            <input
              type="color"
              className="h-9 w-14 cursor-pointer rounded border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-950"
              value={underlineColor}
              onChange={(e) => setUnderlineColor(e.target.value)}
              title="Accent rule under headline"
              aria-label="Template B underline color"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{underlineColor}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Divider / grid lines
            </label>
            <input
              type="color"
              className="h-9 w-14 cursor-pointer rounded border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-950"
              value={dividerColor}
              onChange={(e) => setDividerColor(e.target.value)}
              title="Vertical lines between columns"
              aria-label="Template B column divider color"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{dividerColor}</span>
          </div>
          <button
            type="button"
            onClick={resetToDefaults}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Reset to defaults
          </button>
        </div>
      </div>

      <ObjectiveLivePreview
        mergedObjectiveConfig={mergedObjectiveConfig}
        media={[]}
        templateId="B"
        brandingAccentColor={brandingAccentColor}
        onStatementOverflow={handleStatementOverflow}
      />
    </div>
  );
}

type ObjectiveTemplateCEditorProps = {
  config: ObjectivePageConfig;
  onChange: (next: ObjectivePageConfig) => void;
  brandIcons: { id: string; imageUrl: string; name?: string }[];
  projectId?: string;
  transcriptText?: string | null;
  overviewText?: string | null;
  /** Brand accent color. Bar defaults to this when barColor is unset; not persisted unless user sets bar color. */
  brandingAccentColor?: string | null;
};

function ObjectiveTemplateCEditor({
  config,
  onChange,
  brandIcons,
  projectId,
  transcriptText,
  overviewText,
  brandingAccentColor,
}: ObjectiveTemplateCEditorProps) {
  const columns = useMemo(() => getTemplateCColumns(config), [config]);
  /** Display/saved bar color: explicit templateC.barColor, else accent, else default. Do not persist accent into config. */
  const barColor = getTemplateCBarColor(config, brandingAccentColor);
  const mergedObjectiveConfig = useMemo(
    () => ({ ...config, templateC: { ...config.templateC, barColor, columns }, columns }),
    [config, barColor, columns]
  );

  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  const setColumn = (index: number, patch: Partial<NonNullable<ObjectivePageConfig["columns"]>[0]>) => {
    const nextCols = [...columns];
    nextCols[index] = { ...nextCols[index], ...patch };
    const nextTc = {
      ...config.templateC,
      barColor: config.templateC?.barColor ?? undefined,
      columns: nextCols,
    };
    onChange({ ...config, templateC: nextTc, columns: nextCols });
  };

  const setBarColor = (value: string) => {
    const hex = value.trim() && /^#[0-9A-Fa-f]{6}$/.test(value.trim()) ? value.trim() : undefined;
    const nextTc = { ...config.templateC, barColor: hex, columns: getTemplateCColumns(config) };
    onChange({ ...config, templateC: nextTc, columns: nextTc.columns });
  };

  const handleGenerateThree = async () => {
    setColumnsError(null);
    setColumnsLoading(true);
    try {
      const result = await suggestTemplateCColumnsAction({
        projectId: projectId ?? "",
        objectiveTitle: config.title,
        objectiveText: config.objectiveText,
        transcriptText,
        overviewText,
      });
      if ("error" in result) {
        setColumnsError(result.error);
        return;
      }
      const nextCols = result.columns.map((c) => ({
        title: c.title,
        description: c.description,
        iconId: c.iconId ?? null,
      }));
      const nextTc = {
        ...config.templateC,
        barColor: config.templateC?.barColor ?? undefined,
        columns: nextCols,
      };
      onChange({ ...config, templateC: nextTc, columns: nextCols });
    } finally {
      setColumnsLoading(false);
    }
  };

  const handleRegenerateColumn = async (index: number) => {
    setColumnsError(null);
    setRegeneratingIndex(index);
    try {
      const result = await suggestTemplateCColumnAction({
        projectId: projectId ?? "",
        columnIndex: index,
        objectiveTitle: config.title,
        objectiveText: config.objectiveText,
        transcriptText,
        overviewText,
      });
      if ("error" in result) {
        setColumnsError(result.error);
        return;
      }
      const c = result.column;
      setColumn(index, { title: c.title, description: c.description, iconId: c.iconId });
    } finally {
      setRegeneratingIndex(null);
    }
  };

  return (
    <div className="mt-4 space-y-6">
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white/80 p-4 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <p className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Template C — Executive Summary
        </p>
        <p className="text-zinc-500 dark:text-zinc-400">
          Uses the Executive Label (above) and the headline and paragraph from the shared content. Edit the three columns below.
        </p>
      </section>

      {/* Bar Color + Generate row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Bar Color (defaults to Accent)</label>
          <input
            type="color"
            className="h-9 w-14 cursor-pointer rounded border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-950"
            value={barColor}
            onChange={(e) => setBarColor(e.target.value)}
            title="Left vertical bar color"
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{barColor}</span>
        </div>
        <button
          type="button"
          onClick={handleGenerateThree}
          disabled={columnsLoading || !projectId}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {columnsLoading ? "Generating…" : "Generate 3 Columns with AI"}
        </button>
        {columnsError && (
          <p className="text-xs text-red-600 dark:text-red-400">{columnsError}</p>
        )}
      </div>

      {/* 3-column editor grid mirroring final layout */}
      <div className="grid gap-6 sm:grid-cols-3">
        {columns.map((col, idx) => (
          <div
            key={idx}
            className="flex flex-col rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Column {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => handleRegenerateColumn(idx)}
                disabled={regeneratingIndex !== null || !projectId}
                className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950 disabled:opacity-50"
              >
                {regeneratingIndex === idx ? "…" : "Regenerate"}
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-col items-center">
                <TemplateCIconPicker
                  icons={brandIcons}
                  value={col.iconId ?? null}
                  onChange={(iconId) => setColumn(idx, { iconId })}
                  label="Icon"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Title
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  value={col.title ?? ""}
                  onChange={(e) =>
                    setColumn(idx, {
                      title: e.target.value.slice(0, TEMPLATE_C_TITLE_MAX_LENGTH),
                    })
                  }
                  maxLength={TEMPLATE_C_TITLE_MAX_LENGTH}
                  placeholder="2–5 words"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Description
                </label>
                <textarea
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  rows={3}
                  maxLength={TEMPLATE_C_DESCRIPTION_MAX_LENGTH}
                  value={col.description ?? ""}
                  onChange={(e) =>
                    setColumn(idx, {
                      description: e.target.value.slice(0, TEMPLATE_C_DESCRIPTION_MAX_LENGTH),
                    })
                  }
                  placeholder="1–2 sentences"
                />
                <p className="mt-1 text-right text-xs text-zinc-500 dark:text-zinc-400">
                  {(col.description ?? "").length} / {TEMPLATE_C_DESCRIPTION_MAX_LENGTH}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ObjectiveLivePreview
        mergedObjectiveConfig={mergedObjectiveConfig}
        media={[]}
        templateId="C"
        brandIcons={brandIcons}
        brandingAccentColor={brandingAccentColor}
      />
    </div>
  );
}

export function PageEditor({
  pageId,
  config,
  onConfigChange,
  media,
  rooms,
  roomsWithConcepts,
  rollupRoomIds,
  eligibleRollupRoomIds,
  conceptMediaByRoom,
  coverContent,
  projectId,
  transcriptText,
  overviewText,
  brandIcons = [],
  brandingAccentColor = null,
  libraryPhotos,
}: PageEditorProps) {
  const p = config.pages ?? {};
  const [applyingWhyUsDefaults, setApplyingWhyUsDefaults] = useState(false);
  const [whyUsOverflow, setWhyUsOverflow] = useState(false);
  const [rewritingWhyUsToFit, setRewritingWhyUsToFit] = useState(false);
  const update = (partial: Partial<PresentationConfigSaved>) => {
    onConfigChange({ ...config, ...partial });
  };
  const updatePages = (pagesPartial: Partial<NonNullable<PresentationConfigSaved["pages"]>>) => {
    update({ pages: { ...p, ...pagesPartial } });
  };

  if (!pageId) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-zinc-500 dark:text-zinc-400">
        Select a page from the list.
      </div>
    );
  }

  const mergedLayout = useMemo(
    () => getLayoutConfig(config),
    [config]
  );
  const mergedCoverConfig = mergedLayout.pages.cover;

  const whyUsDefaultsLoadedForConfigRef = useRef<PresentationConfigSaved | null>(null);
  useEffect(() => {
    if (pageId !== "whyUs") return;
    const whyUsConfig = p.whyUs;
    if (!isWhyUsEmpty(whyUsConfig)) return;
    if (whyUsDefaultsLoadedForConfigRef.current === config) return;
    whyUsDefaultsLoadedForConfigRef.current = config;
    void getCompanyWhyUsDefaultsForProjectAction().then((result) => {
      if ("error" in result && result.error) return;
      if ("title" in result && result.pillars) {
        updatePages({
          whyUs: {
            ...(p.whyUs ?? {}),
            title: result.title,
            pillars: result.pillars.map((pillar) => ({
              iconKey: pillar.iconKey,
              headline: pillar.headline,
              body: pillar.body,
            })),
          },
        });
      }
    });
  }, [pageId, config, p.whyUs]);

  if (pageId === "cover") {
    const currentVariant = (p.cover?.variant ?? "heroOverlay") as "heroOverlay" | "splitCover" | "titlePlate";
    const coverHeroImageId = coverContent?.coverHeroImageId ?? null;
    const heroMedia = coverHeroImageId
      ? media.find((m) => m.id === coverHeroImageId)
      : null;

    const coverTitle = (coverContent?.title ?? "").trim();
    const coverSubtitle = (coverContent?.subtitle ?? "").trim() || null;
    const missingRequired = !coverTitle || !coverSubtitle;

    const previewContent = {
      title: coverTitle,
      subtitle: coverSubtitle || null,
      badge: "Project Investment & Design Concept" as const,
      meta: null as React.ReactNode,
    };

    /** Preview uses project.coverHeroImageId as hero (source of truth from Media → Front Page). */
    const previewCoverConfig = {
      ...mergedCoverConfig,
      heroMediaId: coverHeroImageId ?? null,
    };

    const mediaLink =
      projectId != null ? (
        <Link
          href={`/admin/projects/${projectId}?tab=media`}
          className="font-medium text-zinc-600 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Go to Media → Front Page to select a cover image.
        </Link>
      ) : (
        <span className="text-zinc-600 dark:text-zinc-400">
          Go to Media → Front Page to select a cover image.
        </span>
      );

    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Cover Page
        </h2>

        {missingRequired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            Missing required Overview fields for Cover. Please complete Overview.
          </div>
        )}

        <section>
          <h3 className={labelClass}>Cover Layout</h3>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {COVER_VARIANTS.map((v) => (
              <div key={v.id} className="min-w-0">
                <CoverLayoutThumbnail
                  variant={v.id}
                  selected={currentVariant === v.id}
                  onSelect={() =>
                    updatePages({
                      cover: { ...p.cover, variant: v.id },
                    })
                  }
                  title={coverContent?.title}
                  subtitle={coverContent?.subtitle}
                />
                <p className="mt-1 text-center text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {v.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className={labelClass}>Hero Image</h3>
          {heroMedia != null ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroMedia.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Selected on Media → Front Page
              </p>
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
              No cover image selected. {mediaLink}
            </div>
          )}
        </section>

        <CoverLivePreview
          mergedCoverConfig={previewCoverConfig}
          media={media}
          previewContent={previewContent}
          coverHeroImageId={coverHeroImageId}
        />
      </div>
    );
  }

  if (pageId === "objective") {
    const rawObjective = (p.objective ?? {}) as ObjectivePageConfig;
    const templateId: ObjectiveTemplateId = (rawObjective.templateId as ObjectiveTemplateId) ?? "A";
    const executiveLabelEmpty = templateId === "C" && !(rawObjective.title ?? "").trim();
    const updateObjective = (partial: Partial<ObjectivePageConfig>) => {
      updatePages({
        objective: {
          ...rawObjective,
          ...partial,
        },
      });
    };

    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Objective Page
        </h2>

        {executiveLabelEmpty && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            Executive Label is required for Template C. Please enter it in the field below.
          </div>
        )}

        {/* Shared Objective content (used by all templates) */}
        <ObjectiveContentEditor
          config={rawObjective}
          onChange={updateObjective}
          projectId={projectId}
          transcriptText={transcriptText}
          overviewText={overviewText}
          templateId={templateId}
        />

        {/* Template selection + compact settings row */}
        <section className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Choose your Objective template.
          </p>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <div className="grid gap-3 md:grid-cols-3">
                {([
                  {
                    id: "A" as ObjectiveTemplateId,
                    title: "Template A",
                    subtitle: "Objective + 3 Commitments + Photo collage",
                    available: true,
                  },
                  {
                    id: "B" as ObjectiveTemplateId,
                    title: "Template B",
                    subtitle: "Statement + 3 pillars",
                    available: true,
                  },
                  {
                    id: "C" as ObjectiveTemplateId,
                    title: "Template C",
                    subtitle: "Executive Summary (label + 3 columns)",
                    available: true,
                  },
                ] satisfies { id: ObjectiveTemplateId; title: string; subtitle: string; available: boolean }[]).map(
                  (tpl) => {
                    const selected = templateId === tpl.id;
                    const disabled = !tpl.available;
                    return (
                      <div
                        key={tpl.id}
                        className={`relative flex h-full flex-col rounded-xl border-2 p-3 text-left transition-colors ${
                          selected
                            ? "border-emerald-500 ring-2 ring-emerald-300 dark:border-emerald-400"
                            : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (disabled) return;
                            const nextTemplate = tpl.id;
                        let next: ObjectivePageConfig = {
                          ...rawObjective,
                          templateId: nextTemplate,
                          variant:
                            nextTemplate === "A"
                              ? "twoColGallery"
                              : (rawObjective.variant ?? "twoColGallery"),
                        };
                        if (nextTemplate === "C") {
                          const cols = getTemplateCColumns(next);
                          const prevTc = next.templateC ?? {};
                          next = {
                            ...next,
                            templateC: {
                              ...prevTc,
                              barColor: prevTc.barColor ?? undefined,
                              columns: cols,
                            },
                            columns: cols,
                          };
                        }
                        updatePages({ objective: next });
                          }}
                          className="flex flex-1 flex-col text-left"
                          aria-pressed={selected}
                          aria-disabled={disabled}
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
                              {tpl.id}
                            </span>
                          </div>
                          <div className="relative mt-1 aspect-video w-full overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
                            {tpl.id === "B" ? (
                              <div className="absolute inset-0 flex flex-col p-1.5 text-[9px] text-zinc-500 dark:text-zinc-400">
                                <div className="flex items-center justify-center">
                                  <div className="h-2 w-3/5 rounded bg-zinc-200 dark:bg-zinc-700" />
                                </div>
                                <div className="mt-1 h-px w-4/5 self-center bg-zinc-300 dark:bg-zinc-600" />
                                <div className="mt-1 flex flex-1 flex-col items-center justify-center space-y-0.5">
                                  <div className="h-1 w-3/4 rounded bg-zinc-200 dark:bg-zinc-700" />
                                  <div className="h-1 w-2/3 rounded bg-zinc-200 dark:bg-zinc-700" />
                                  <div className="h-1 w-1/2 rounded bg-zinc-200 dark:bg-zinc-700" />
                                  <div className="h-1 w-2/3 rounded bg-zinc-200 dark:bg-zinc-700" />
                                </div>
                                <div className="mt-1 grid grid-cols-3 rounded bg-white/80 text-[8px] dark:bg-zinc-900/70">
                                  {["left", "center", "right"].map((key, idx) => (
                                    <div
                                      // eslint-disable-next-line react/no-array-index-key
                                      key={key + idx}
                                      className={`flex flex-col items-center justify-center px-0.5 py-1 ${
                                        idx > 0
                                          ? "border-l border-zinc-200 dark:border-zinc-700"
                                          : ""
                                      }`}
                                    >
                                      <div className="h-1.5 w-3/4 rounded bg-zinc-300 dark:bg-zinc-600" />
                                      <div className="mt-0.5 h-1 w-4/5 rounded bg-zinc-200 dark:bg-zinc-700" />
                                      <div className="mt-0.5 h-1 w-3/5 rounded bg-zinc-200 dark:bg-zinc-700" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : tpl.id === "C" ? (
                              <div className="absolute inset-0 flex p-0 text-[9px] text-zinc-500 dark:text-zinc-400">
                                <div className="flex w-6 shrink-0 items-center justify-center border-r border-zinc-300 bg-zinc-200/80 dark:border-zinc-600 dark:bg-zinc-800">
                                  <span className="origin-center rotate-[-90deg] whitespace-nowrap text-[8px] font-medium">
                                    Label
                                  </span>
                                </div>
                                <div className="flex flex-1 flex-col p-1">
                                  <div className="h-2 w-2/3 rounded bg-zinc-200 dark:bg-zinc-700" />
                                  <div className="mt-0.5 h-1 w-full rounded bg-zinc-200/80 dark:bg-zinc-700/80" />
                                  <div className="mt-1 grid grid-cols-3 gap-0.5">
                                    {[1, 2, 3].map((i) => (
                                      <div
                                        key={i}
                                        className="flex flex-col items-center justify-center rounded border border-dashed border-zinc-300 px-0.5 py-1 dark:border-zinc-600"
                                      >
                                        <div className="h-1.5 w-1.5 rounded bg-zinc-300 dark:bg-zinc-600" />
                                        <div className="mt-0.5 h-1 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
                                        <div className="mt-0.5 h-0.5 w-4/5 rounded bg-zinc-200/80 dark:bg-zinc-700/80" />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="absolute inset-0 grid grid-cols-[1.3fr_0.9fr] gap-1 p-1">
                                <div className="flex flex-col justify-between rounded bg-white/70 p-1.5 text-[9px] text-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-400">
                                  <div className="h-2 w-3/4 rounded bg-zinc-200 dark:bg-zinc-700" />
                                  <div className="mt-1 space-y-0.5">
                                    <div className="h-1.5 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
                                    <div className="h-1.5 w-5/6 rounded bg-zinc-200 dark:bg-zinc-700" />
                                  </div>
                                  <div className="mt-1 space-y-0.5">
                                    <div className="h-1 w-4/5 rounded bg-zinc-200 dark:bg-zinc-700" />
                                    <div className="h-1 w-4/6 rounded bg-zinc-200 dark:bg-zinc-700" />
                                    <div className="h-1 w-3/5 rounded bg-zinc-200 dark:bg-zinc-700" />
                                  </div>
                                </div>
                                <div className="grid grid-rows-2 gap-1">
                                  <div className="rounded bg-zinc-300 dark:bg-zinc-700" />
                                  <div className="grid grid-cols-2 gap-1">
                                    <div className="rounded bg-zinc-300 dark:bg-zinc-700" />
                                    <div className="rounded bg-zinc-300 dark:bg-zinc-700" />
                                  </div>
                                </div>
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
                        {tpl.id === "A" && selected && (
                          <div className="mt-3 border-t border-dashed border-zinc-200 pt-3 text-xs dark:border-zinc-700">
                            <label
                              htmlFor="objective-variant"
                              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                            >
                              Public Page Style
                            </label>
                            <select
                              id="objective-variant"
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                              value={rawObjective.variant ?? "twoColGallery"}
                              onChange={(e) =>
                                updateObjective({
                                  variant: e.target.value as
                                    | "twoColGallery"
                                    | "fullBleedQuote",
                                })
                              }
                            >
                              <option value="twoColGallery">
                                Standard (Text + Photo Collage)
                              </option>
                              <option value="fullBleedQuote">
                                Quote Focus (Minimal Photos)
                              </option>
                            </select>
                            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                              Controls how this Objective page appears in the
                              client-facing proposal and in the preview below.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Template
          </h3>

          {templateId === "A" && (
            <ObjectiveTemplateAEditor
              config={rawObjective}
              onChange={updateObjective}
              projectId={projectId}
              transcriptText={transcriptText}
              overviewText={overviewText}
            />
          )}
          {templateId === "B" && (
            <ObjectiveTemplateBEditor
              config={rawObjective}
              onChange={updateObjective}
              projectId={projectId}
              transcriptText={transcriptText}
              overviewText={overviewText}
              brandingAccentColor={brandingAccentColor}
            />
          )}
          {templateId === "C" && (
            <ObjectiveTemplateCEditor
              config={rawObjective}
              onChange={updateObjective}
              brandIcons={brandIcons}
              projectId={projectId}
              transcriptText={transcriptText}
              overviewText={overviewText}
              brandingAccentColor={brandingAccentColor}
            />
          )}
        </section>
      </div>
    );
  }

  if (pageId === "whyUs") {
    const whyUsVariant = mergedLayout.pages.whyUs.variant;
    const currentVariant = p.whyUs?.variant ?? "gridCards";
    type WhyUsVariantOption = "gridCards" | "stacked" | "columns" | "simple";
    const setWhyUsVariant = (v: WhyUsVariantOption) =>
      updatePages({
        whyUs: { ...(p.whyUs ?? {}), variant: v },
      });

    const applyCompanyDefaults = async () => {
      setApplyingWhyUsDefaults(true);
      const result = await getCompanyWhyUsDefaultsForProjectAction();
      setApplyingWhyUsDefaults(false);
      if ("error" in result && result.error) {
        alert(result.error);
        return;
      }
      if ("title" in result && result.pillars) {
        updatePages({
          whyUs: {
            ...(p.whyUs ?? {}),
            title: result.title,
            pillars: result.pillars.map((pillar) => ({
              iconKey: pillar.iconKey,
              headline: pillar.headline,
              body: pillar.body,
            })),
          },
        });
      }
    };

    const whyUsTemplates: {
      id: WhyUsVariantOption;
      title: string;
      subtitle: string;
    }[] = [
      { id: "gridCards", title: "Grid Cards", subtitle: "2×2 grid of pillar cards" },
      { id: "stacked", title: "Stacked Rows", subtitle: "Vertical list of rows" },
      { id: "columns", title: "Three Columns", subtitle: "Three-column layout" },
      {
        id: "simple",
        title: "Hero Value Statements",
        subtitle: "Centered slide with 2–4 value statements",
      },
    ];

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Why Us Page
          </h2>
          <button
            type="button"
            onClick={applyCompanyDefaults}
            disabled={applyingWhyUsDefaults}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {applyingWhyUsDefaults ? "Applying…" : "Reset to Company Defaults"}
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Defaults are loaded from Settings → Value Pillars when this page is empty.
        </p>

        <WhyUsContentEditor
          config={p.whyUs}
          onChange={(next) => updatePages({ whyUs: next })}
          brandIcons={brandIcons}
        />

        {/* Shared typography + icon sizing for all Why Us templates */}
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Text & icon sizes
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            These sliders adjust shared headline, body, and icon sizing across all Why Us templates.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {/* Headline size */}
            <div>
              <label className={labelClass}>Headline size</label>
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={20}
                    max={44}
                    step={1}
                    className="h-2 w-full cursor-pointer accent-zinc-900"
                    value={(() => {
                      const raw = p.whyUs?.style?.headlineSizePx;
                      const n =
                        typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                          ? raw
                          : 34;
                      return Math.min(44, Math.max(20, n));
                    })()}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      const clamped = Number.isNaN(value)
                        ? 34
                        : Math.min(44, Math.max(20, value));
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          style: {
                            ...(p.whyUs?.style ?? {}),
                            headlineSizePx: clamped,
                          },
                        },
                      });
                    }}
                  />
                  <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                    {(() => {
                      const raw = p.whyUs?.style?.headlineSizePx;
                      const n =
                        typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                          ? raw
                          : 34;
                      const clamped = Math.min(44, Math.max(20, n));
                      return `${clamped}px`;
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Body size */}
            <div>
              <label className={labelClass}>Body size</label>
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={14}
                    max={30}
                    step={1}
                    className="h-2 w-full cursor-pointer accent-zinc-900"
                    value={(() => {
                      const raw = p.whyUs?.style?.bodySizePx;
                      const n =
                        typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                          ? raw
                          : 20;
                      return Math.min(30, Math.max(14, n));
                    })()}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      const clamped = Number.isNaN(value)
                        ? 20
                        : Math.min(30, Math.max(14, value));
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          style: {
                            ...(p.whyUs?.style ?? {}),
                            bodySizePx: clamped,
                          },
                        },
                      });
                    }}
                  />
                  <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                    {(() => {
                      const raw = p.whyUs?.style?.bodySizePx;
                      const n =
                        typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                          ? raw
                          : 20;
                      const clamped = Math.min(30, Math.max(14, n));
                      return `${clamped}px`;
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Icon scale */}
            <div>
              <label className={labelClass}>Icon scale</label>
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.8}
                    max={2.5}
                    step={0.05}
                    className="h-2 w-full cursor-pointer accent-zinc-900"
                    value={(() => {
                      const raw = p.whyUs?.style?.iconScale;
                      const n =
                        typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                          ? raw
                          : 1.0;
                      const clamped = Math.min(2.5, Math.max(0.8, n));
                      return clamped;
                    })()}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      const clamped = Number.isNaN(value)
                        ? 1.0
                        : Math.min(2.5, Math.max(0.8, value));
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          style: {
                            ...(p.whyUs?.style ?? {}),
                            iconScale: clamped,
                          },
                        },
                      });
                    }}
                  />
                  <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                    {(() => {
                      const raw = p.whyUs?.style?.iconScale;
                      const n =
                        typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                          ? raw
                          : 1.0;
                      const clamped = Math.min(2.5, Math.max(0.8, n));
                      return `${clamped.toFixed(2)}×`;
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Hero headline scale (Hero Value Statements only) */}
            <div>
              <label className={labelClass}>Hero headline scale</label>
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1.2}
                    max={2.4}
                    step={0.05}
                    className="h-2 w-full cursor-pointer accent-zinc-900"
                    value={(() => {
                      const raw = p.whyUs?.style?.heroHeadlineScale;
                      const n =
                        typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                          ? raw
                          : 1.6;
                      const clamped = Math.min(2.4, Math.max(1.2, n));
                      return clamped;
                    })()}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      const clamped = Number.isNaN(value)
                        ? 1.6
                        : Math.min(2.4, Math.max(1.2, value));
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          style: {
                            ...(p.whyUs?.style ?? {}),
                            heroHeadlineScale: clamped,
                          },
                        },
                      });
                    }}
                  />
                  <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                    {(() => {
                      const raw = p.whyUs?.style?.heroHeadlineScale;
                      const n =
                        typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                          ? raw
                          : 1.6;
                      const clamped = Math.min(2.4, Math.max(1.2, n));
                      return `${clamped.toFixed(2)}×`;
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Hero Value Statements spacing */}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Statement spacing</label>
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={24}
                    max={60}
                    step={1}
                    className="h-2 w-full cursor-pointer accent-zinc-900"
                    value={(() => {
                      const raw = p.whyUs?.style?.heroStatementSpacingPx;
                      const n =
                        typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                          ? raw
                          : 36;
                      const clamped = Math.min(60, Math.max(24, n));
                      return clamped;
                    })()}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      const clamped = Number.isNaN(value)
                        ? 36
                        : Math.min(60, Math.max(24, value));
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          style: {
                            ...(p.whyUs?.style ?? {}),
                            heroStatementSpacingPx: clamped,
                          },
                        },
                      });
                    }}
                  />
                  <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                    {(() => {
                      const raw = p.whyUs?.style?.heroStatementSpacingPx;
                      const n =
                        typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                          ? raw
                          : 36;
                      const clamped = Math.min(60, Math.max(24, n));
                      return `${clamped}px`;
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Choose your Why Us template.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {whyUsTemplates.map((tpl) => {
              const selected = currentVariant === tpl.id;
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
                    onClick={() => setWhyUsVariant(tpl.id)}
                    className="flex flex-1 flex-col text-left"
                    aria-pressed={selected}
                  >
                    <div className="mb-2">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {tpl.title}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {tpl.subtitle}
                      </p>
                    </div>
                    <div className="relative mt-1 aspect-video w-full overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
                      {tpl.id === "gridCards" ? (
                        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 p-1.5">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className="rounded border border-zinc-300 bg-white/80 dark:border-zinc-600 dark:bg-zinc-800"
                            >
                              <div className="h-1.5 w-2/3 rounded bg-zinc-200 dark:bg-zinc-600" />
                              <div className="mt-0.5 h-1 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
                            </div>
                          ))}
                        </div>
                      ) : tpl.id === "stacked" ? (
                        <div className="absolute inset-0 flex flex-col gap-1 p-1.5">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className="flex flex-1 items-center gap-2 rounded border border-zinc-300 bg-white/80 px-1 dark:border-zinc-600 dark:bg-zinc-800"
                            >
                              <div className="h-2 w-2 shrink-0 rounded bg-zinc-300 dark:bg-zinc-600" />
                              <div className="h-1 flex-1 rounded bg-zinc-200 dark:bg-zinc-700" />
                            </div>
                          ))}
                        </div>
                      ) : tpl.id === "columns" ? (
                        <div className="absolute inset-0 flex gap-1 p-1.5">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="flex flex-1 flex-col rounded border border-zinc-300 bg-white/80 p-1 dark:border-zinc-600 dark:bg-zinc-800"
                            >
                              <div className="mx-auto h-2 w-2 rounded bg-zinc-300 dark:bg-zinc-600" />
                              <div className="mt-0.5 h-1 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
                              <div className="mt-0.5 h-0.5 w-4/5 rounded bg-zinc-200/80 dark:bg-zinc-700/80" />
                            </div>
                          ))}
                        </div>
                      ) : tpl.id === "simple" ? (
                        <div className="absolute inset-0 flex flex-col justify-center px-3 py-2">
                          <div className="mb-1 h-2 w-1/2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                          <div className="mb-2 h-0.5 w-2/3 rounded-full bg-orange-400/90 dark:bg-orange-500" />
                          <div className="flex flex-1 items-stretch gap-2">
                            <div className="relative flex w-4 flex-col items-center">
                              <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 rounded-full bg-orange-400/80 dark:bg-orange-500/80" />
                              {[0, 1, 2, 3].map((i) => (
                                <div
                                  key={i}
                                  className="relative flex flex-1 items-center justify-center"
                                >
                                  <div className="h-1.5 w-1.5 rounded-full bg-orange-500 shadow-sm dark:bg-orange-400" />
                                </div>
                              ))}
                            </div>
                            <div className="flex-1 space-y-1.5 pt-0.5">
                              {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex items-start gap-1.5">
                                  <div className="mt-[1px] h-2 w-2 rounded bg-zinc-300 dark:bg-zinc-600" />
                                  <div className="space-y-0.5">
                                    <div className="h-1.5 w-2/3 rounded bg-zinc-200 dark:bg-zinc-700" />
                                    <div className="h-1 w-3/4 rounded bg-zinc-200/80 dark:bg-zinc-800/70" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col gap-0.5 p-1.5">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className="flex items-center gap-1.5 border-b border-zinc-200 py-0.5 dark:border-zinc-700"
                            >
                              <div className="h-1.5 w-1.5 shrink-0 rounded bg-zinc-300 dark:bg-zinc-600" />
                              <div className="h-1 w-3/4 rounded bg-zinc-200 dark:bg-zinc-700" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {whyUsVariant === "gridCards" && (
          <section className="space-y-3 rounded-xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Grid Cards Style
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Card background color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600"
                    value={
                      p.whyUs?.gridCardsStyle?.cardBg?.trim()?.match(/^#[0-9A-Fa-f]{6}$/)
                        ? p.whyUs.gridCardsStyle.cardBg
                        : GRID_CARDS_DEFAULT_CARD_BG
                    }
                    onChange={(e) =>
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          gridCardsStyle: {
                            ...(p.whyUs?.gridCardsStyle ?? {}),
                            cardBg: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <input
                    type="text"
                    className={inputClass}
                    value={p.whyUs?.gridCardsStyle?.cardBg ?? GRID_CARDS_DEFAULT_CARD_BG}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          gridCardsStyle: {
                            ...(p.whyUs?.gridCardsStyle ?? {}),
                            cardBg: v || GRID_CARDS_DEFAULT_CARD_BG,
                          },
                        },
                      });
                    }}
                    placeholder={GRID_CARDS_DEFAULT_CARD_BG}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Card border color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600"
                    value={
                      p.whyUs?.gridCardsStyle?.cardBorder?.trim()?.match(/^#[0-9A-Fa-f]{6}$/)
                        ? p.whyUs.gridCardsStyle.cardBorder
                        : GRID_CARDS_DEFAULT_CARD_BORDER
                    }
                    onChange={(e) =>
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          gridCardsStyle: {
                            ...(p.whyUs?.gridCardsStyle ?? {}),
                            cardBorder: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <input
                    type="text"
                    className={inputClass}
                    value={p.whyUs?.gridCardsStyle?.cardBorder ?? GRID_CARDS_DEFAULT_CARD_BORDER}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          gridCardsStyle: {
                            ...(p.whyUs?.gridCardsStyle ?? {}),
                            cardBorder: v || GRID_CARDS_DEFAULT_CARD_BORDER,
                          },
                        },
                      });
                    }}
                    placeholder={GRID_CARDS_DEFAULT_CARD_BORDER}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {whyUsVariant === "stacked" && (
          <section className="space-y-3 rounded-xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Stacked Rows Style
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Row background color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600"
                    value={
                      p.whyUs?.stackedStyle?.cardBg?.trim()?.match(/^#[0-9A-Fa-f]{6}$/)
                        ? p.whyUs.stackedStyle.cardBg
                        : STACKED_DEFAULT_CARD_BG
                    }
                    onChange={(e) =>
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          stackedStyle: {
                            ...(p.whyUs?.stackedStyle ?? {}),
                            cardBg: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <input
                    type="text"
                    className={inputClass}
                    value={p.whyUs?.stackedStyle?.cardBg ?? STACKED_DEFAULT_CARD_BG}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          stackedStyle: {
                            ...(p.whyUs?.stackedStyle ?? {}),
                            cardBg: v || STACKED_DEFAULT_CARD_BG,
                          },
                        },
                      });
                    }}
                    placeholder={STACKED_DEFAULT_CARD_BG}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Underline color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600"
                    value={
                      p.whyUs?.stackedStyle?.underlineColor?.trim()?.match(/^#[0-9A-Fa-f]{6}$/)
                        ? p.whyUs.stackedStyle.underlineColor
                        : STACKED_DEFAULT_UNDERLINE_COLOR
                    }
                    onChange={(e) =>
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          stackedStyle: {
                            ...(p.whyUs?.stackedStyle ?? {}),
                            underlineColor: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <input
                    type="text"
                    className={inputClass}
                    value={p.whyUs?.stackedStyle?.underlineColor ?? STACKED_DEFAULT_UNDERLINE_COLOR}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          stackedStyle: {
                            ...(p.whyUs?.stackedStyle ?? {}),
                            underlineColor: v || STACKED_DEFAULT_UNDERLINE_COLOR,
                          },
                        },
                      });
                    }}
                    placeholder={STACKED_DEFAULT_UNDERLINE_COLOR}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {whyUsVariant === "columns" && (
          <section className="space-y-4 rounded-xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Three Columns Style
            </h3>

            {/* Row 1: colors (2-column grid on desktop) */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Title underline color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600"
                    value={
                      p.whyUs?.columnsStyle?.underlineColor?.trim()?.match(/^#[0-9A-Fa-f]{6}$/)
                        ? p.whyUs.columnsStyle.underlineColor
                        : COLUMNS_DEFAULT_UNDERLINE_COLOR
                    }
                    onChange={(e) =>
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          columnsStyle: {
                            ...(p.whyUs?.columnsStyle ?? {}),
                            underlineColor: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <input
                    type="text"
                    className={inputClass}
                    value={p.whyUs?.columnsStyle?.underlineColor ?? COLUMNS_DEFAULT_UNDERLINE_COLOR}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          columnsStyle: {
                            ...(p.whyUs?.columnsStyle ?? {}),
                            underlineColor: v || COLUMNS_DEFAULT_UNDERLINE_COLOR,
                          },
                        },
                      });
                    }}
                    placeholder={COLUMNS_DEFAULT_UNDERLINE_COLOR}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Text color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600"
                    value={
                      p.whyUs?.columnsStyle?.textColor?.trim()?.match(/^#[0-9A-Fa-f]{6}$/)
                        ? p.whyUs.columnsStyle.textColor
                        : COLUMNS_DEFAULT_TEXT_COLOR
                    }
                    onChange={(e) =>
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          columnsStyle: {
                            ...(p.whyUs?.columnsStyle ?? {}),
                            textColor: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <input
                    type="text"
                    className={inputClass}
                    value={p.whyUs?.columnsStyle?.textColor ?? COLUMNS_DEFAULT_TEXT_COLOR}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          columnsStyle: {
                            ...(p.whyUs?.columnsStyle ?? {}),
                            textColor: v || COLUMNS_DEFAULT_TEXT_COLOR,
                          },
                        },
                      });
                    }}
                    placeholder={COLUMNS_DEFAULT_TEXT_COLOR}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Visible pillars
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Choose which pillars show in the Three Columns layout. First three are visible by default.
              </p>
              <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {getWhyUsVisiblePillars(p.whyUs?.visiblePillars).map((checked, index) => {
                  const label =
                    p.whyUs?.pillars?.[index]?.headline?.trim() ||
                    `Pillar ${index + 1}`;
                  return (
                    <label
                      key={index}
                      className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        checked={checked}
                        onChange={(e) => {
                          const next = getWhyUsVisiblePillars(p.whyUs?.visiblePillars);
                          next[index] = e.target.checked;
                          updatePages({
                            whyUs: {
                              ...(p.whyUs ?? {}),
                              visiblePillars: next,
                            },
                          });
                        }}
                      />
                      <span className="truncate">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {whyUsVariant === "simple" && (
          <section className="space-y-4 rounded-xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Hero Value Statements Style
            </h3>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Underline color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600"
                    value={
                      p.whyUs?.stackedStyle?.underlineColor?.trim()?.match(/^#[0-9A-Fa-f]{6}$/)
                        ? p.whyUs.stackedStyle.underlineColor
                        : STACKED_DEFAULT_UNDERLINE_COLOR
                    }
                    onChange={(e) =>
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          stackedStyle: {
                            ...(p.whyUs?.stackedStyle ?? {}),
                            underlineColor: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <input
                    type="text"
                    className={inputClass}
                    value={
                      p.whyUs?.stackedStyle?.underlineColor ?? STACKED_DEFAULT_UNDERLINE_COLOR
                    }
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          stackedStyle: {
                            ...(p.whyUs?.stackedStyle ?? {}),
                            underlineColor: v || STACKED_DEFAULT_UNDERLINE_COLOR,
                          },
                        },
                      });
                    }}
                    placeholder={STACKED_DEFAULT_UNDERLINE_COLOR}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Text color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600"
                    value={
                      p.whyUs?.columnsStyle?.textColor?.trim()?.match(/^#[0-9A-Fa-f]{6}$/)
                        ? p.whyUs.columnsStyle.textColor
                        : COLUMNS_DEFAULT_TEXT_COLOR
                    }
                    onChange={(e) =>
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          columnsStyle: {
                            ...(p.whyUs?.columnsStyle ?? {}),
                            textColor: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <input
                    type="text"
                    className={inputClass}
                    value={p.whyUs?.columnsStyle?.textColor ?? COLUMNS_DEFAULT_TEXT_COLOR}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          columnsStyle: {
                            ...(p.whyUs?.columnsStyle ?? {}),
                            textColor: v || COLUMNS_DEFAULT_TEXT_COLOR,
                          },
                        },
                      });
                    }}
                    placeholder={COLUMNS_DEFAULT_TEXT_COLOR}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Dot color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600"
                    value={
                      p.whyUs?.simpleStyle?.dotColor?.trim()?.match(/^#[0-9A-Fa-f]{6}$/)
                        ? p.whyUs.simpleStyle.dotColor
                        : p.whyUs?.stackedStyle?.underlineColor ??
                          STACKED_DEFAULT_UNDERLINE_COLOR
                    }
                    onChange={(e) =>
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          simpleStyle: {
                            ...(p.whyUs?.simpleStyle ?? {}),
                            dotColor: e.target.value,
                          },
                        },
                      })
                    }
                  />
                  <input
                    type="text"
                    className={inputClass}
                    value={
                      p.whyUs?.simpleStyle?.dotColor ??
                      p.whyUs?.stackedStyle?.underlineColor ??
                      STACKED_DEFAULT_UNDERLINE_COLOR
                    }
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      updatePages({
                        whyUs: {
                          ...(p.whyUs ?? {}),
                          simpleStyle: {
                            ...(p.whyUs?.simpleStyle ?? {}),
                            dotColor:
                              v ||
                              (p.whyUs?.stackedStyle?.underlineColor ??
                                STACKED_DEFAULT_UNDERLINE_COLOR),
                          },
                        },
                      });
                    }}
                    placeholder={
                      p.whyUs?.stackedStyle?.underlineColor ?? STACKED_DEFAULT_UNDERLINE_COLOR
                    }
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={labelClass}>Headline size (px)</label>
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={24}
                      max={44}
                      step={1}
                      className="h-2 w-full cursor-pointer accent-zinc-900"
                      value={(() => {
                        const raw = p.whyUs?.style?.simpleHeadlineSizePx;
                        const n =
                          typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                            ? raw
                            : 32;
                        return Math.min(44, Math.max(24, n));
                      })()}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        const clamped = Number.isNaN(value)
                          ? 32
                          : Math.min(44, Math.max(24, value));
                        updatePages({
                          whyUs: {
                            ...(p.whyUs ?? {}),
                            style: {
                              ...(p.whyUs?.style ?? {}),
                              simpleHeadlineSizePx: clamped,
                            },
                          },
                        });
                      }}
                    />
                    <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                      {(() => {
                        const raw = p.whyUs?.style?.simpleHeadlineSizePx;
                        const n =
                          typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                            ? raw
                            : 32;
                        const clamped = Math.min(44, Math.max(24, n));
                        return `${clamped}px`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <label className={labelClass}>Body size (px)</label>
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={16}
                      max={28}
                      step={1}
                      className="h-2 w-full cursor-pointer accent-zinc-900"
                      value={(() => {
                        const raw = p.whyUs?.style?.simpleBodySizePx;
                        const n =
                          typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                            ? raw
                            : 20;
                        return Math.min(28, Math.max(16, n));
                      })()}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        const clamped = Number.isNaN(value)
                          ? 20
                          : Math.min(28, Math.max(16, value));
                        updatePages({
                          whyUs: {
                            ...(p.whyUs ?? {}),
                            style: {
                              ...(p.whyUs?.style ?? {}),
                              simpleBodySizePx: clamped,
                            },
                          },
                        });
                      }}
                    />
                    <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                      {(() => {
                        const raw = p.whyUs?.style?.simpleBodySizePx;
                        const n =
                          typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                            ? raw
                            : 20;
                        const clamped = Math.min(28, Math.max(16, n));
                        return `${clamped}px`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <label className={labelClass}>Dot size (px)</label>
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={8}
                      max={18}
                      step={1}
                      className="h-2 w-full cursor-pointer accent-zinc-900"
                      value={(() => {
                        const raw = p.whyUs?.style?.simpleDotSizePx;
                        const n =
                          typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                            ? raw
                            : 12;
                        return Math.min(18, Math.max(8, n));
                      })()}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        const clamped = Number.isNaN(value)
                          ? 12
                          : Math.min(18, Math.max(8, value));
                        updatePages({
                          whyUs: {
                            ...(p.whyUs ?? {}),
                            style: {
                              ...(p.whyUs?.style ?? {}),
                              simpleDotSizePx: clamped,
                            },
                          },
                        });
                      }}
                    />
                    <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                      {(() => {
                        const raw = p.whyUs?.style?.simpleDotSizePx;
                        const n =
                          typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                            ? raw
                            : 12;
                        const clamped = Math.min(18, Math.max(8, n));
                        return `${clamped}px`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={labelClass}>Row gap (px)</label>
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={12}
                      max={40}
                      step={1}
                      className="h-2 w-full cursor-pointer accent-zinc-900"
                      value={(() => {
                        const raw = p.whyUs?.style?.simpleRowGapPx;
                        const n =
                          typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                            ? raw
                            : 24;
                        return Math.min(40, Math.max(12, n));
                      })()}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        const clamped = Number.isNaN(value)
                          ? 24
                          : Math.min(40, Math.max(12, value));
                        updatePages({
                          whyUs: {
                            ...(p.whyUs ?? {}),
                            style: {
                              ...(p.whyUs?.style ?? {}),
                              simpleRowGapPx: clamped,
                            },
                          },
                        });
                      }}
                    />
                    <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                      {(() => {
                        const raw = p.whyUs?.style?.simpleRowGapPx;
                        const n =
                          typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                            ? raw
                            : 24;
                        const clamped = Math.min(40, Math.max(12, n));
                        return `${clamped}px`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <label className={labelClass}>Icon scale</label>
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0.8}
                      max={2.0}
                      step={0.05}
                      className="h-2 w-full cursor-pointer accent-zinc-900"
                      value={(() => {
                        const raw = p.whyUs?.simpleStyle?.iconScale;
                        const n =
                          typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                            ? raw
                            : 1.0;
                        const clamped = Math.min(2.0, Math.max(0.8, n));
                        return clamped;
                      })()}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        const clamped = Number.isNaN(value)
                          ? 1.0
                          : Math.min(2.0, Math.max(0.8, value));
                        updatePages({
                          whyUs: {
                            ...(p.whyUs ?? {}),
                            simpleStyle: {
                              ...(p.whyUs?.simpleStyle ?? {}),
                              iconScale: clamped,
                            },
                          },
                        });
                      }}
                    />
                    <span className="min-w-[3rem] text-right text-xs text-zinc-600 dark:text-zinc-300">
                      {(() => {
                        const raw = p.whyUs?.simpleStyle?.iconScale;
                        const n =
                          typeof raw === "number" && Number.isFinite(raw) && !Number.isNaN(raw)
                            ? raw
                            : 1.0;
                        const clamped = Math.min(2.0, Math.max(0.8, n));
                        return `${clamped.toFixed(2)}×`;
                      })()}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Base icon: 72px
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Options</label>
                </div>
                <div className="space-y-1 text-xs text-zinc-700 dark:text-zinc-200">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      checked={p.whyUs?.style?.simpleShowIcons ?? true}
                      onChange={(e) => {
                        updatePages({
                          whyUs: {
                            ...(p.whyUs ?? {}),
                            style: {
                              ...(p.whyUs?.style ?? {}),
                              simpleShowIcons: e.target.checked,
                            },
                          },
                        });
                      }}
                    />
                    <span>Show icons</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      checked={p.whyUs?.style?.simpleCenterTitle ?? false}
                      onChange={(e) => {
                        updatePages({
                          whyUs: {
                            ...(p.whyUs ?? {}),
                            style: {
                              ...(p.whyUs?.style ?? {}),
                              simpleCenterTitle: e.target.checked,
                            },
                          },
                        });
                      }}
                    />
                    <span>Center title</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className={labelClass}>Footer note (optional)</label>
              <input
                type="text"
                className={inputClass}
                value={p.whyUs?.simpleFooterText ?? ""}
                onChange={(e) => {
                  updatePages({
                    whyUs: {
                      ...(p.whyUs ?? {}),
                      simpleFooterText: e.target.value,
                    },
                  });
                }}
                placeholder="Short footer line shown under the timeline"
              />
            </div>

          </section>
        )}

        {whyUsVariant === "gridCards" && whyUsOverflow && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/50">
            <span className="text-amber-800 dark:text-amber-200">
              Some text does not fit this template. Click &quot;Rewrite to Fit&quot;.
            </span>
            <button
              type="button"
              onClick={async () => {
                const pillars = p.whyUs?.pillars ?? [];
                if (pillars.length === 0) return;
                setRewritingWhyUsToFit(true);
                const result = await rewriteWhyUsToFitAction({ pillars });
                setRewritingWhyUsToFit(false);
                if ("error" in result && result.error) {
                  alert(result.error);
                  return;
                }
                if ("pillars" in result)
                  updatePages({
                    whyUs: { ...(p.whyUs ?? {}), pillars: result.pillars },
                  });
              }}
              disabled={rewritingWhyUsToFit}
              className="rounded-lg border border-amber-600 bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-50 dark:border-amber-500 dark:bg-amber-900/60 dark:text-amber-100 dark:hover:bg-amber-800"
            >
              {rewritingWhyUsToFit ? "Rewriting…" : "Rewrite to Fit (Grid Cards)"}
            </button>
          </div>
        )}

        <WhyUsLivePreview
          config={p.whyUs}
          variant={whyUsVariant}
          brandIcons={brandIcons}
          onOverflowChange={setWhyUsOverflow}
        />
      </div>
    );
  }

  if (pageId === "rollup") {
    const conceptCountByRoom = new Map<string, number>(
      Object.entries(conceptMediaByRoom).map(([rid, arr]) => [rid, arr.length])
    );
    return (
      <AdditionalSectionsEditor
        config={config}
        onConfigChange={onConfigChange}
        remainingScopeRoomIds={eligibleRollupRoomIds}
        rooms={rooms}
        conceptCountByRoom={conceptCountByRoom}
      />
    );
  }

  if (pageId.startsWith("room:")) {
    const roomId = pageId.slice(5);
    const room = rooms.find((r) => r.id === roomId);
    // Same logic as Media tab "Existing Photos": type === EXISTING && roomId match (key = roomId).
    const existingPhotosForRoom = media
      .filter((m) => m.type === "EXISTING" && m.roomId === roomId)
      .map((m) => ({ id: m.id, url: m.url }));
    const roomMedia = (conceptMediaByRoom[roomId] ?? []).map((c) => ({
      id: c.id,
      url: c.url,
      label: `Concept — ${c.id.slice(0, 8)}`,
    }));
    return (
      <SectionPageEditor
        sectionKey={roomId}
        sectionTitle={room?.name ?? "Section"}
        config={config}
        onConfigChange={onConfigChange}
        roomMedia={roomMedia}
        existingPhotosForRoom={existingPhotosForRoom}
        room={room ?? null}
        media={media}
        libraryPhotos={libraryPhotos}
      />
    );
  }

  return null;
}
