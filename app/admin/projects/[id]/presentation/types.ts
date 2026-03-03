import type {
  ObjectivePageConfig,
  PresentationConfigSaved,
  PresentationSettings,
} from "@/app/lib/layout-config";
import { getTemplateCColumns } from "@/app/lib/layout-config";

export type PresentationPageId =
  | "cover"
  | "objective"
  | "whyUs"
  | "transitions"
  | "settings"
  | `room:${string}`
  | "rollup";

export type PageKind =
  | "cover"
  | "objective"
  | "whyUs"
  | "transitions"
  | "settings"
  | "room"
  | "rollup";

export type PageListItem = {
  id: PresentationPageId;
  label: string;
  kind: PageKind;
  /** For kind "room": room id. */
  roomId?: string;
  badge?: number;
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
    whyUs: { variant: "gridCards" as const },
    rooms: {} as Record<string, { enabled?: boolean; variant?: string; featuredMediaId?: string | null }>,
    rollup: { mode: "auto" as const, variant: "simpleList" as const, roomIds: [] as string[] },
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
  type WhyUsVariant = "gridCards" | "iconRows";

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
      whyUs: {
        variant:
          whyUsVariant === "gridCards" || whyUsVariant === "iconRows"
            ? (whyUsVariant as WhyUsVariant)
            : "gridCards",
      },
      rooms:
        pages.rooms != null &&
        typeof pages.rooms === "object" &&
        !Array.isArray(pages.rooms)
          ? (pages.rooms as Record<string, { enabled?: boolean; variant?: string; featuredMediaId?: string | null }>)
          : {},
      rollup: {
        mode: rollupMode === "manual" ? "manual" : "auto",
        variant: rollupVariant === "simpleList" ? "simpleList" : "simpleList",
        roomIds: rollupRoomIds,
      },
    },
  };
}
