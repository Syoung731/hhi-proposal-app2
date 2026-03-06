import type {
  AdditionalSectionsConfig,
  ObjectivePageConfig,
  PresentationConfigSaved,
  PresentationSettings,
  SectionPageConfig,
  SectionsConfigMap,
  WhyUsPageConfig,
} from "@/app/lib/layout-config";
import { getTemplateCColumns } from "@/app/lib/layout-config";

/** Reserved key in pages.sections; section config keys are room/section ids only. */
export const ADDITIONAL_SECTIONS_KEY = "additionalSections" as const;

/** Iterate section ids from pages.sections (excludes additionalSections key). */
export function getSectionConfigKeys(
  sections: Record<string, SectionPageConfig> | undefined
): string[] {
  if (!sections || typeof sections !== "object") return [];
  return Object.keys(sections).filter((k) => k !== ADDITIONAL_SECTIONS_KEY);
}

const SECTION_MAX_MEDIA = 3;

const TITLE_SCALE_MIN = 0.85;
const TITLE_SCALE_MAX = 1.25;
const TITLE_SCALE_DEFAULT = 1.0;
const PHOTO_AREA_MIN = 40;
const PHOTO_AREA_MAX = 72;
const PHOTO_AREA_DEFAULT = 58;
const SCOPE_AREA_MIN = 12;
const SCOPE_AREA_MAX = 32;
const SCOPE_AREA_DEFAULT = 22;
const SCOPE_TEXT_SCALE_MIN = 0.85;
const SCOPE_TEXT_SCALE_MAX = 1.25;
const SCOPE_TEXT_SCALE_DEFAULT = 1.0;
const PHOTO_PLUS_SCOPE_MAX = 90;

function clampTitleScale(v: number): number {
  return Math.min(TITLE_SCALE_MAX, Math.max(TITLE_SCALE_MIN, Number(v)));
}

function clampPhotoAreaPct(v: number): number {
  return Math.min(PHOTO_AREA_MAX, Math.max(PHOTO_AREA_MIN, Math.round(Number(v))));
}

function clampScopeAreaPct(v: number): number {
  return Math.min(SCOPE_AREA_MAX, Math.max(SCOPE_AREA_MIN, Math.round(Number(v))));
}

function clampScopeTextScale(v: number): number {
  return Math.min(SCOPE_TEXT_SCALE_MAX, Math.max(SCOPE_TEXT_SCALE_MIN, Number(v)));
}

/** Enforce photoAreaPct + scopeAreaPct <= PHOTO_PLUS_SCOPE_MAX. Returns { photoAreaPct, scopeAreaPct } clamped. */
export function clampLayoutAreas(
  photoAreaPct: number,
  scopeAreaPct: number
): { photoAreaPct: number; scopeAreaPct: number } {
  let photo = clampPhotoAreaPct(photoAreaPct);
  let scope = clampScopeAreaPct(scopeAreaPct);
  if (photo + scope > PHOTO_PLUS_SCOPE_MAX) {
    scope = Math.min(scope, PHOTO_PLUS_SCOPE_MAX - photo);
    scope = clampScopeAreaPct(scope);
    if (photo + scope > PHOTO_PLUS_SCOPE_MAX) {
      photo = Math.min(photo, PHOTO_PLUS_SCOPE_MAX - scope);
      photo = clampPhotoAreaPct(photo);
    }
  }
  return { photoAreaPct: photo, scopeAreaPct: scope };
}

/** Get layout slider values with defaults and guardrails. */
function getSectionLayoutSliders(raw: SectionPageConfig | undefined): {
  titleScale: number;
  photoAreaPct: number;
  scopeAreaPct: number;
} {
  const titleScale = clampTitleScale(
    typeof raw?.titleScale === "number" && Number.isFinite(raw.titleScale)
      ? raw.titleScale
      : TITLE_SCALE_DEFAULT
  );
  let photoAreaPct = clampPhotoAreaPct(
    typeof raw?.photoAreaPct === "number" && Number.isFinite(raw.photoAreaPct)
      ? raw.photoAreaPct
      : PHOTO_AREA_DEFAULT
  );
  let scopeAreaPct = clampScopeAreaPct(
    typeof raw?.scopeAreaPct === "number" && Number.isFinite(raw.scopeAreaPct)
      ? raw.scopeAreaPct
      : SCOPE_AREA_DEFAULT
  );
  const clamped = clampLayoutAreas(photoAreaPct, scopeAreaPct);
  return { titleScale, photoAreaPct: clamped.photoAreaPct, scopeAreaPct: clamped.scopeAreaPct };
}

/** Get config for one section with defaults applied. */
export function getSectionConfig(
  sections: Record<string, SectionPageConfig> | undefined,
  sectionKey: string
): SectionPageConfig {
  const raw = sections && typeof sections === "object" ? sections[sectionKey] : undefined;
  const splitDensity: 1 | 2 | 3 =
    raw?.splitDensity === 1 || raw?.splitDensity === 2 || raw?.splitDensity === 3
      ? raw.splitDensity
      : 2;
  const beforeSource = Array.isArray(raw?.beforeSelectedMediaIds)
    ? raw.beforeSelectedMediaIds
    : Array.isArray(raw?.beforeMediaIds)
      ? raw.beforeMediaIds
      : [];
  const afterSource = Array.isArray(raw?.afterSelectedMediaIds)
    ? raw.afterSelectedMediaIds
    : Array.isArray(raw?.afterMediaIds)
      ? raw.afterMediaIds
      : [];
  const beforeSelectedMediaIds = beforeSource.slice(0, splitDensity);
  const afterSelectedMediaIds = afterSource.slice(0, splitDensity);
  const scopeSize: "S" | "M" | "L" =
    raw?.scopeSize === "S" || raw?.scopeSize === "M" || raw?.scopeSize === "L"
      ? raw.scopeSize
      : "M";
  const layout = getSectionLayoutSliders(raw);
  const scopeTextScale = clampScopeTextScale(
    typeof raw?.scopeTextScale === "number" && Number.isFinite(raw.scopeTextScale)
      ? raw.scopeTextScale
      : SCOPE_TEXT_SCALE_DEFAULT
  );
  return {
    include: raw?.include !== false,
    layoutVariant: raw?.layoutVariant === "heroAfter" || raw?.layoutVariant === "storyboard" ? raw.layoutVariant : "split",
    splitDensity,
    featuredConceptMediaId: raw?.featuredConceptMediaId ?? null,
    beforeSelectedMediaIds,
    afterSelectedMediaIds,
    scopeSize,
    titleScale: layout.titleScale,
    photoAreaPct: layout.photoAreaPct,
    scopeAreaPct: layout.scopeAreaPct,
    scopeTextScale,
  };
}

/** Extract section key (room id) from a section page id; returns null for non-section pages. */
export function getSectionKey(pageId: PresentationPageId | null): string | null {
  if (pageId == null || !pageId.startsWith("room:")) return null;
  const key = pageId.slice(5);
  return key || null;
}

/** Parse URL hash to presentation page id; returns null if hash is empty or unknown. */
export function parsePresentationHash(hash: string): PresentationPageId | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  if (raw === "cover") return "cover";
  if (raw === "objective") return "objective";
  if (raw === "why-us") return "whyUs";
  if (raw === "additional-sections") return "rollup";
  if (raw.startsWith("section:")) {
    const key = raw.slice("section:".length);
    return key ? (`room:${key}` as PresentationPageId) : null;
  }
  return null;
}

export type PresentationPageId =
  | "cover"
  | "objective"
  | "whyUs"
  | `room:${string}`
  | "rollup";

export type PageKind =
  | "cover"
  | "objective"
  | "whyUs"
  | "room"
  | "rollup";

export type PageListItem = {
  id: PresentationPageId;
  label: string;
  kind: PageKind;
  /** For kind "room": room id. */
  roomId?: string;
  badge?: number;
  /** For kind "room": whether the room page is published in the public presentation (default: true). */
  published?: boolean;
};

/** Default presentation settings for live view. */
export const DEFAULT_PRESENTATION_SETTINGS: Required<PresentationSettings> = {
  background: "light",
  transition: "fade",
  speed: "normal",
};

/** Default full config for the editor. Must satisfy PresentationConfigSaved exactly. */
export const DEFAULT_PRESENTATION_CONFIG = {
  version: 1,
  settings: DEFAULT_PRESENTATION_SETTINGS,
  transitions: { mode: "fade" as const },
  pages: {
    cover: { variant: "heroOverlay" as const, heroMediaId: null },
    objective: {
      variant: "twoColGallery" as const,
      templateId: "A",
      title: "Project Objective",
      objectiveText: "",
      commitments: ["", "", ""],
      photoSlots: [{}, {}, {}],
      executiveLabel: "Executive Summary",
      columns: [{}, {}, {}],
      ai: {
        suggestedSections: [],
        suggestedTags: [],
        suggestedPhotoIds: [],
        copyLastRunAt: null,
        photoLastRunAt: null,
        lastRunAt: null,
        appliedAt: null,
        appliedHash: null,
      },
    } satisfies ObjectivePageConfig,
    whyUs: {
      variant: "gridCards" as const,
      style: {
        headlineSizePx: 34,
        bodySizePx: 20,
        iconScale: 1.0,
        heroHeadlineScale: 1.6,
        heroStatementSpacingPx: 36,
      },
      columnsStyle: {
        headlineSize: "34px",
        bodySize: "20px",
        iconScale: 1.0,
      },
    } satisfies WhyUsPageConfig,
    sections: {
      additionalSections: { include: true },
    },
    rooms: {} as Record<
      string,
      {
        enabled?: boolean;
        variant?: string;
        featuredMediaId?: string | null;
        published?: boolean;
      }
    >,
    rollup: {
      mode: "auto" as const,
      variant: "simpleList" as const,
      roomIds: [] as string[],
      published: true,
    },
  },
} satisfies PresentationConfigSaved;

/** Normalize saved JSON (legacy or new shape) into full PresentationConfigSaved. */
export function normalizePresentationConfig(
  saved: unknown
): PresentationConfigSaved {
  if (saved == null || typeof saved !== "object" || Array.isArray(saved))
    return DEFAULT_PRESENTATION_CONFIG;
  const s = saved as Record<string, unknown>;
  const rawPages = s.pages;
  const pages: Record<string, unknown> =
    rawPages != null &&
    typeof rawPages === "object" &&
    !Array.isArray(rawPages)
      ? (rawPages as Record<string, unknown>)
      : {};
  const legacy = s as {
    cover?: { variant?: string; heroMediaId?: string | null };
    objective?: ObjectivePageConfig | { variant?: string };
    difference?: { variant?: string };
    whyUs?: { variant?: string };
    animations?: { mode?: string };
  };
  type TransitionMode = "none" | "fade" | "slide";
  type CoverVariant = "heroOverlay" | "splitCover" | "titlePlate";
  type ObjectiveVariant = "twoColGallery" | "fullBleedQuote";
  type WhyUsVariant =
    | "gridCards"
    | "stacked"
    | "columns"
    | "simple"
    | "iconRows";

  const transitionsMode =
    (s.transitions as { mode?: string } | undefined)?.mode ??
    (legacy.animations?.mode === "none" ||
    legacy.animations?.mode === "fade" ||
    legacy.animations?.mode === "slide"
      ? legacy.animations!.mode
      : "fade");
  const coverVariant =
    (pages.cover as { variant?: string } | undefined)?.variant ??
    legacy.cover?.variant ??
    "heroOverlay";

  const rawObjective =
    (pages.objective as ObjectivePageConfig | undefined) ??
    (legacy.objective as ObjectivePageConfig | undefined) ??
    {};

  const objectiveVariant =
    (rawObjective as { variant?: string } | undefined)?.variant ??
    "twoColGallery";
  const whyUsVariant =
    (pages.whyUs as { variant?: string } | undefined)?.variant ??
    legacy.difference?.variant ??
    (legacy as { whyUs?: { variant?: string } }).whyUs?.variant ??
    "gridCards";
  const rollupVariant =
    (pages.rollup as { variant?: string } | undefined)?.variant ?? "simpleList";
  const rollupMode =
    (pages.rollup as { mode?: string } | undefined)?.mode ?? "auto";
  const rollupRoomIdsRaw = (pages.rollup as { roomIds?: unknown } | undefined)?.roomIds;
  const rollupRoomIds: string[] =
    Array.isArray(rollupRoomIdsRaw) && rollupRoomIdsRaw.every((x): x is string => typeof x === "string")
      ? rollupRoomIdsRaw
      : [];

  const rawSettings = s.settings as Partial<PresentationSettings> | undefined;
  type Background = PresentationSettings["background"];
  type Speed = PresentationSettings["speed"];
  const background =
    rawSettings?.background === "light" ||
    rawSettings?.background === "dark" ||
    rawSettings?.background === "warm" ||
    rawSettings?.background === "imageOverlay"
      ? (rawSettings.background as Background)
      : DEFAULT_PRESENTATION_SETTINGS.background;
  const transition =
    transitionsMode === "none" || transitionsMode === "fade" || transitionsMode === "slide"
      ? (transitionsMode as PresentationSettings["transition"])
      : DEFAULT_PRESENTATION_SETTINGS.transition;
  const speed =
    rawSettings?.speed === "slow" || rawSettings?.speed === "normal" || rawSettings?.speed === "fast"
      ? (rawSettings.speed as Speed)
      : DEFAULT_PRESENTATION_SETTINGS.speed;

  const settings: PresentationSettings = {
    background,
    transition,
    speed,
  };

  return {
    version: typeof s.version === "number" ? s.version : 1,
    settings,
    transitions: {
      mode:
        transitionsMode === "none" || transitionsMode === "fade" || transitionsMode === "slide"
          ? (transitionsMode as TransitionMode)
          : "fade",
    },
    pages: {
      cover: {
        variant:
          coverVariant === "heroOverlay" || coverVariant === "splitCover" || coverVariant === "titlePlate"
            ? (coverVariant as CoverVariant)
            : "heroOverlay",
        heroMediaId:
          (pages.cover as { heroMediaId?: string | null } | undefined)
            ?.heroMediaId ?? legacy.cover?.heroMediaId ?? null,
      },
      objective: (() => {
        const obj = { ...(rawObjective as ObjectivePageConfig) } as ObjectivePageConfig;
        obj.variant =
          objectiveVariant === "twoColGallery" || objectiveVariant === "fullBleedQuote"
            ? (objectiveVariant as ObjectiveVariant)
            : "twoColGallery";
        // Preserve templateB (underlineColor, dividerColor) when present.
        if (rawObjective && typeof rawObjective === "object" && "templateB" in rawObjective) {
          const tb = (rawObjective as ObjectivePageConfig).templateB;
          if (tb && typeof tb === "object") {
            obj.templateB = { ...tb };
          }
        }
        // Migrate any legacy templateC.subtitle into the shared top-level subtitle
        // when subtitle is missing, so it survives template switching.
        if (!obj.subtitle && obj.templateC?.subtitle) {
          obj.subtitle = obj.templateC.subtitle;
        }
        if (obj.templateId === "C") {
          const cols = getTemplateCColumns(obj);
          const barColor =
            obj.templateC?.barColor?.trim() && /^#[0-9A-Fa-f]{6}$/.test(obj.templateC.barColor.trim())
              ? obj.templateC.barColor.trim()
              : undefined;
          obj.templateC = { ...obj.templateC, barColor, columns: cols };
          obj.columns = cols;
        }
        return obj;
      })(),
      whyUs: (() => {
        const base = {
          ...(pages.whyUs as WhyUsPageConfig | undefined),
        } as WhyUsPageConfig;

        // Backward-compat: migrate legacy Three Columns sizing into shared style
        // when no shared style is set yet, so existing projects keep their look
        // and new shared sliders control all templates.
        if (!base.style && base.columnsStyle) {
          const nextStyle: WhyUsPageConfig["style"] = {};

          const rawHeadline = base.columnsStyle.headlineSize;
          const headlineN =
            typeof rawHeadline === "string" ? parseInt(rawHeadline, 10) : NaN;
          if (Number.isFinite(headlineN) && !Number.isNaN(headlineN)) {
            nextStyle.headlineSizePx = headlineN;
          }

          const rawBody = base.columnsStyle.bodySize;
          const bodyN =
            typeof rawBody === "string" ? parseInt(rawBody, 10) : NaN;
          if (Number.isFinite(bodyN) && !Number.isNaN(bodyN)) {
            nextStyle.bodySizePx = bodyN;
          }

          const rawIconScale = base.columnsStyle.iconScale;
          if (
            typeof rawIconScale === "number" &&
            Number.isFinite(rawIconScale) &&
            !Number.isNaN(rawIconScale)
          ) {
            nextStyle.iconScale = rawIconScale;
          }

          if (Object.keys(nextStyle).length > 0) {
            base.style = nextStyle;
          }
        }

        const resolvedVariant: WhyUsVariant =
          whyUsVariant === "gridCards" ||
          whyUsVariant === "stacked" ||
          whyUsVariant === "columns" ||
          whyUsVariant === "simple" ||
          whyUsVariant === "iconRows"
            ? (whyUsVariant as WhyUsVariant)
            : "gridCards";

        return {
          ...base,
          variant: resolvedVariant,
        };
      })(),
      ...((): { sections: SectionsConfigMap; rooms: Record<string, { enabled?: boolean; variant?: string; featuredMediaId?: string | null; published?: boolean }> } => {
        const rawSections = pages.sections as SectionsConfigMap | undefined;
        const baseRooms =
          pages.rooms != null &&
          typeof pages.rooms === "object" &&
          !Array.isArray(pages.rooms)
            ? (pages.rooms as Record<
                string,
                {
                  enabled?: boolean;
                  variant?: string;
                  featuredMediaId?: string | null;
                  published?: boolean;
                }
              >)
            : {};
        const rollupPublished = (pages.rollup as { published?: boolean } | undefined)?.published !== false;
        type LayoutV = SectionPageConfig["layoutVariant"];

        let built: SectionsConfigMap = {};
        if (rawSections != null && typeof rawSections === "object" && !Array.isArray(rawSections)) {
          built = { ...rawSections };
        } else {
          for (const [roomId, cfg] of Object.entries(baseRooms)) {
            const v = cfg?.variant;
            const layoutVariant: LayoutV =
              v === "heroAfter" ? "heroAfter" : v === "storyboard" ? "storyboard" : "split";
            built[roomId] = {
              include: cfg?.enabled !== false,
              layoutVariant,
              featuredConceptMediaId: cfg?.featuredMediaId ?? null,
            };
          }
          const addCfg = (rawSections as { additionalSections?: AdditionalSectionsConfig } | undefined)?.additionalSections;
          built[ADDITIONAL_SECTIONS_KEY] = {
            include: addCfg?.include !== false && rollupPublished,
          };
        }

        const normalized: SectionsConfigMap = {};
        for (const k of Object.keys(built)) {
          if (k === ADDITIONAL_SECTIONS_KEY) {
            const addRaw = (built as Record<string, unknown>)[k] as AdditionalSectionsConfig | undefined;
            normalized[ADDITIONAL_SECTIONS_KEY] = {
              include: addRaw?.include !== false,
            };
            continue;
          }
          const raw = built[k] as SectionPageConfig | undefined;
          const layoutVariant: LayoutV =
            raw?.layoutVariant === "heroAfter" || raw?.layoutVariant === "storyboard"
              ? raw.layoutVariant
              : "split";
          const splitDensity: 1 | 2 | 3 =
            raw?.splitDensity === 1 || raw?.splitDensity === 2 || raw?.splitDensity === 3
              ? raw.splitDensity
              : 2;
          const beforeSource = Array.isArray(raw?.beforeSelectedMediaIds)
            ? raw.beforeSelectedMediaIds
            : Array.isArray(raw?.beforeMediaIds)
              ? raw.beforeMediaIds
              : [];
          const afterSource = Array.isArray(raw?.afterSelectedMediaIds)
            ? raw.afterSelectedMediaIds
            : Array.isArray(raw?.afterMediaIds)
              ? raw.afterMediaIds
              : [];
          const scopeSize: "S" | "M" | "L" =
            raw?.scopeSize === "S" || raw?.scopeSize === "M" || raw?.scopeSize === "L"
              ? raw.scopeSize
              : "M";
          const layout = getSectionLayoutSliders(raw);
          const scopeTextScale = clampScopeTextScale(
            typeof raw?.scopeTextScale === "number" && Number.isFinite(raw.scopeTextScale)
              ? raw.scopeTextScale
              : SCOPE_TEXT_SCALE_DEFAULT
          );
          normalized[k] = {
            include: raw?.include !== false,
            layoutVariant,
            splitDensity,
            featuredConceptMediaId: raw?.featuredConceptMediaId ?? null,
            beforeSelectedMediaIds: beforeSource.slice(0, splitDensity),
            afterSelectedMediaIds: afterSource.slice(0, splitDensity),
            scopeSize,
            titleScale: layout.titleScale,
            photoAreaPct: layout.photoAreaPct,
            scopeAreaPct: layout.scopeAreaPct,
            scopeTextScale,
          };
        }
        if (normalized[ADDITIONAL_SECTIONS_KEY] == null) {
          normalized[ADDITIONAL_SECTIONS_KEY] = { include: rollupPublished };
        }

        const sectionKeys = getSectionConfigKeys(normalized);
        const allRoomIds = new Set<string>([...Object.keys(baseRooms), ...sectionKeys]);
        const roomsOut: Record<string, { enabled?: boolean; variant?: string; featuredMediaId?: string | null; published?: boolean }> = {};
        for (const roomId of allRoomIds) {
          const sec = normalized[roomId];
          const cfg = baseRooms[roomId];
          const layoutV = sec?.layoutVariant ?? (cfg?.variant === "heroAfter" ? "heroAfter" : cfg?.variant === "storyboard" ? "storyboard" : "split");
          roomsOut[roomId] = {
            enabled: sec?.include !== false,
            variant: layoutV,
            featuredMediaId: sec?.featuredConceptMediaId ?? cfg?.featuredMediaId ?? null,
            published: cfg?.published === undefined ? true : cfg.published,
          };
        }
        return { sections: normalized, rooms: roomsOut };
      })(),
      rollup: {
        mode: rollupMode === "manual" ? "manual" : "auto",
        variant: rollupVariant === "simpleList" ? "simpleList" : "simpleList",
        roomIds: rollupRoomIds,
        published:
          (pages.rollup as { published?: boolean } | undefined)?.published === undefined
            ? true
            : (pages.rollup as { published?: boolean } | undefined)!.published,
      },
    },
  };
}
