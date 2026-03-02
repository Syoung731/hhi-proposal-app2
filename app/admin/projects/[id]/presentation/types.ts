import type { PresentationConfigSaved } from "@/app/lib/layout-config";

export type PresentationPageId =
  | "cover"
  | "objective"
  | "whyUs"
  | "transitions"
  | `room:${string}`
  | "rollup";

export type PageKind =
  | "cover"
  | "objective"
  | "whyUs"
  | "transitions"
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

/** Default full config for the editor. Must satisfy PresentationConfigSaved exactly. */
export const DEFAULT_PRESENTATION_CONFIG = {
  version: 1,
  transitions: { mode: "fade" as const },
  pages: {
    cover: { variant: "heroOverlay" as const, heroMediaId: null },
    objective: { variant: "twoColGallery" as const },
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
    objective?: { variant?: string };
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
  const objectiveVariant =
    (pages.objective as { variant?: string } | undefined)?.variant ??
    legacy.objective?.variant ??
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

  return {
    version: typeof s.version === "number" ? s.version : 1,
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
      objective: {
        variant:
          objectiveVariant === "twoColGallery" || objectiveVariant === "fullBleedQuote"
            ? (objectiveVariant as ObjectiveVariant)
            : "twoColGallery",
      },
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
