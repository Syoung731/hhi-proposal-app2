"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPresentationMediaSnapshotAction,
  savePresentationLayoutAction,
} from "./actions";
import { listLibraryMediaAction } from "@/app/admin/settings/photo-library/actions";
import type { LibraryMediaItem } from "@/app/admin/settings/photo-library/types";
import { PageList } from "./page-list";
import { PageEditor } from "./page-editor";
import { SettingsTab } from "./settings-tab";
import { SaveBar } from "./save-bar";
import type { PresentationConfigSaved, SectionPageConfig } from "@/app/lib/layout-config";
import type { PageListItem, PresentationPageId } from "./types";
import { ADDITIONAL_SECTIONS_KEY, normalizePresentationConfig } from "./types";

type MediaItem = {
  id: string;
  url: string;
  kind: string;
  type?: string;
  roomId?: string | null;
  parentMediaId?: string | null;
};
type RoomItem = {
  id: string;
  name: string;
  scopeNarrative?: string;
  lengthIn?: number | null;
  widthIn?: number | null;
  ceilingHeightIn?: number | null;
};

export type CoverContentOption = {
  title: string;
  subtitle?: string | null;
  coverHeroImageId?: string | null;
};

export type BrandIconOption = { id: string; imageUrl: string; name?: string };

type PresentationTabProps = {
  projectId: string;
  initialConfig: unknown;
  media: MediaItem[];
  /** Rooms in DB order (sortOrder). */
  rooms: RoomItem[];
  /** For cover page live preview (project title, subtitle, coverHeroImageId). */
  coverContent?: CoverContentOption | null;
  /** Optional transcript + overview objective text for Objective AI helpers. */
  transcriptText?: string | null;
  overviewText?: string | null;
  /** Brand icons for Objective Template C column icon picker. */
  brandIcons?: BrandIconOption[];
  /** Brand accent color (e.g. CompanySettings.primaryColorHex). Template C bar defaults to this when barColor is unset. */
  brandingAccentColor?: string | null;
};

/** Concept count = root RENDERING count per room (parentMediaId null). */
function getConceptCountByRoom(media: MediaItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of media) {
    if (m.type !== "RENDERING" || !m.roomId) continue;
    if (m.parentMediaId != null) continue;
    map.set(m.roomId, (map.get(m.roomId) ?? 0) + 1);
  }
  return map;
}

function getConceptMediaByRoom(media: MediaItem[]): Record<string, { id: string; url: string }[]> {
  const byRoom: Record<string, { id: string; url: string }[]> = {};
  for (const m of media) {
    if (m.type !== "RENDERING" || !m.roomId) continue;
    if (!byRoom[m.roomId]) byRoom[m.roomId] = [];
    byRoom[m.roomId].push({ id: m.id, url: m.url });
  }
  return byRoom;
}

/**
 * Additional Sections rollup = rooms where section is unchecked (or legacy: not published).
 * Source of truth: pages.sections[roomId].include === false; legacy: roomsConfig.published === false when no section config.
 * Order = rooms order.
 */
function computeRollupRoomIds(
  rooms: RoomItem[],
  _roomsWithConcepts: string[],
  config: PresentationConfigSaved
): string[] {
  const p = config.pages ?? {};
  const roomsConfig = p.rooms ?? {};
  const sections =
    p.sections && typeof p.sections === "object" && !Array.isArray(p.sections)
      ? (p.sections as Record<string, { include?: boolean }>)
      : null;
  return rooms.filter((r) => {
    const sectionCfg = sections && r.id in sections ? sections[r.id] : undefined;
    const roomCfg = roomsConfig[r.id];
    if (sectionCfg !== undefined) {
      return sectionCfg.include === false;
    }
    return (roomCfg as { published?: boolean } | undefined)?.published === false;
  }).map((r) => r.id);
}

export function PresentationTab({
  projectId,
  initialConfig,
  media: initialMedia,
  rooms,
  coverContent,
  transcriptText,
  overviewText,
  brandIcons = [],
  brandingAccentColor = null,
}: PresentationTabProps) {
  const router = useRouter();
  const [media, setMedia] = useState<MediaItem[]>(initialMedia);
  const [config, setConfig] = useState<PresentationConfigSaved>(() =>
    normalizePresentationConfig(initialConfig)
  );
  const [selectedPageId, setSelectedPageId] = useState<PresentationPageId | null>("cover");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryPhotos, setLibraryPhotos] = useState<LibraryMediaItem[] | undefined>(undefined);
  const [sectionsExpanded, setSectionsExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem("presentationSectionsExpanded");
      if (!raw) return true;
      return raw === "true";
    } catch {
      return true;
    }
  });

  const handleRefreshConcepts = useCallback(async () => {
    setRefreshing(true);
    setErrorMessage(null);
    const result = await getPresentationMediaSnapshotAction(projectId);
    setRefreshing(false);
    if ("error" in result) {
      setErrorMessage(result.error);
      return;
    }
    setMedia(result.snapshot);
  }, [projectId]);

  // Prefetch Photo Library so Template 4 (Completed Project Photos) has data on first load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listLibraryMediaAction({
        includeUnapproved: true,
        pageSize: 100,
        sort: "newest",
      });
      if (!cancelled && !result.error) setLibraryPhotos(result.items);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const conceptCountByRoom = useMemo(() => getConceptCountByRoom(media), [media]);
  const roomsWithConcepts = useMemo(
    () => rooms.filter((r) => (conceptCountByRoom.get(r.id) ?? 0) > 0).map((r) => r.id),
    [rooms, conceptCountByRoom]
  );
  const eligibleRollupRoomIds = useMemo(
    () => computeRollupRoomIds(rooms, roomsWithConcepts, config),
    [rooms, roomsWithConcepts, config]
  );
  const rollupRoomIds = useMemo(() => {
    const mode = config.pages?.rollup?.mode ?? "auto";
    if (mode === "auto") return eligibleRollupRoomIds;
    const manual = config.pages?.rollup?.roomIds ?? [];
    const eligibleSet = new Set(eligibleRollupRoomIds);
    return [...new Set(manual)].filter((id) => eligibleSet.has(id));
  }, [config.pages?.rollup?.mode, config.pages?.rollup?.roomIds, eligibleRollupRoomIds]);
  const conceptMediaByRoom = useMemo(() => getConceptMediaByRoom(media), [media]);
  const hasAnyConceptRooms = roomsWithConcepts.length > 0;

  const pageListItems = useMemo((): PageListItem[] => {
    const items: PageListItem[] = [
      { id: "cover", label: "Cover Page", kind: "cover" },
      { id: "objective", label: "Objective Page", kind: "objective" },
      { id: "whyUs", label: "Why Us Page", kind: "whyUs" },
    ];
    if (hasAnyConceptRooms) {
      const sections = config.pages?.sections;
      const sectionsObj =
        sections && typeof sections === "object" && !Array.isArray(sections) ? sections : null;
      for (const room of rooms) {
        if (!roomsWithConcepts.includes(room.id)) continue;
        const count = conceptCountByRoom.get(room.id) ?? 0;
        const roomCfg = config.pages?.rooms?.[room.id];
        const sectionCfg = sectionsObj ? (sectionsObj[room.id] as SectionPageConfig | undefined) : undefined;
        const published =
          sectionCfg !== undefined
            ? sectionCfg.include !== false
            : (roomCfg?.published !== false);
        items.push({
          id: `room:${room.id}` as PresentationPageId,
          label: room.name,
          kind: "room",
          roomId: room.id,
          badge: count > 0 ? count : undefined,
          published,
        });
      }
    }
    const additionalCfg =
      config.pages?.sections &&
      typeof config.pages.sections === "object" &&
      ADDITIONAL_SECTIONS_KEY in config.pages.sections
        ? (config.pages.sections as Record<string, { include?: boolean }>)[ADDITIONAL_SECTIONS_KEY]
        : undefined;
    const rollupPublished =
      (additionalCfg?.include ?? config.pages?.rollup?.published ?? true) !== false;
    items.push({
      id: "rollup",
      label: "Additional Sections",
      kind: "rollup",
      badge: rollupRoomIds.length,
      published: rollupPublished,
    });
    return items;
  }, [
    rooms,
    roomsWithConcepts,
    rollupRoomIds.length,
    conceptCountByRoom,
    hasAnyConceptRooms,
    config.pages?.rooms,
    config.pages?.sections,
    config.pages?.rollup?.published,
  ]);

  useEffect(() => {
    if (selectedPageId && !pageListItems.some((i) => i.id === selectedPageId)) {
      setSelectedPageId("cover");
    }
  }, [selectedPageId, pageListItems]);

  // Sync selected page with URL hash for deep-linking.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyHash = () => {
      const raw = window.location.hash || "";
      const hash = raw.startsWith("#") ? raw.slice(1) : raw;
      if (!hash) return;
      let next: PresentationPageId | null = null;
      if (hash === "cover") next = "cover";
      else if (hash === "objective") next = "objective";
      else if (hash === "why-us") next = "whyUs";
      else if (hash === "additional-sections") next = "rollup";
      else if (hash.startsWith("section:")) {
        const roomId = hash.slice("section:".length);
        if (roomId && roomsWithConcepts.includes(roomId)) {
          next = `room:${roomId}` as PresentationPageId;
        }
      }
      if (next && pageListItems.some((i) => i.id === next)) {
        setSelectedPageId(next);
      }
    };
    applyHash();
    const onHashChange = () => {
      applyHash();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [roomsWithConcepts, pageListItems]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedPageId) return;
    let hash = "";
    if (selectedPageId === "cover") hash = "cover";
    else if (selectedPageId === "objective") hash = "objective";
    else if (selectedPageId === "whyUs") hash = "why-us";
    else if (selectedPageId === "rollup") hash = "additional-sections";
    else if (selectedPageId.startsWith("room:")) {
      const roomId = selectedPageId.slice(5);
      hash = `section:${roomId}`;
    }
    const url = new URL(window.location.href);
    url.hash = hash ? `#${hash}` : "";
    window.history.replaceState(null, "", url.toString());
  }, [selectedPageId]);

  const selectedPageLabel = useMemo(() => {
    if (!selectedPageId) return "Editor";
    const item = pageListItems.find((i) => i.id === selectedPageId);
    return item?.label ?? "Editor";
  }, [selectedPageId, pageListItems]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "presentationSectionsExpanded",
        sectionsExpanded ? "true" : "false"
      );
    } catch {
      // ignore
    }
  }, [sectionsExpanded]);

  const handleSave = useCallback(async () => {
    setStatus("saving");
    setErrorMessage(null);
    const computedRollup = computeRollupRoomIds(rooms, roomsWithConcepts, config);
    const rollupMode = config.pages?.rollup?.mode ?? "auto";
    const rollupRoomIdsToSave =
      rollupMode === "manual"
        ? (() => {
            const manual = config.pages?.rollup?.roomIds ?? [];
            const eligibleSet = new Set(computedRollup);
            return [...new Set(manual)].filter((id) => eligibleSet.has(id));
          })()
        : computedRollup;
    const sectionsToPersist = config.pages?.sections;
    const additionalInclude =
      sectionsToPersist &&
      typeof sectionsToPersist === "object" &&
      ADDITIONAL_SECTIONS_KEY in sectionsToPersist
        ? (sectionsToPersist as Record<string, { include?: boolean }>)[ADDITIONAL_SECTIONS_KEY]?.include !== false
        : config.pages?.rollup?.published !== false;
    const roomsToPersist: Record<
      string,
      { enabled?: boolean; variant?: string; featuredMediaId?: string | null; published?: boolean }
    > = {};
    for (const roomId of roomsWithConcepts) {
      const sectionCfg =
        sectionsToPersist && typeof sectionsToPersist === "object" && roomId in sectionsToPersist
          ? (sectionsToPersist as Record<string, SectionPageConfig>)[roomId]
          : undefined;
      const roomCfg = config.pages?.rooms?.[roomId];
      const enabled = sectionCfg?.include !== false ?? roomCfg?.enabled !== false;
      const variant = sectionCfg?.layoutVariant ?? roomCfg?.variant ?? "split";
      const featuredMediaId = sectionCfg?.featuredConceptMediaId ?? roomCfg?.featuredMediaId ?? null;
      roomsToPersist[roomId] = {
        enabled,
        variant,
        featuredMediaId,
        published: sectionCfg !== undefined ? sectionCfg.include !== false : (roomCfg?.published ?? true),
      };
    }
    const configToSave: PresentationConfigSaved = {
      ...config,
      pages: {
        ...config.pages,
        sections: sectionsToPersist,
        rooms: roomsToPersist,
        rollup: {
          ...config.pages?.rollup,
          mode: rollupMode,
          variant: config.pages?.rollup?.variant ?? "simpleList",
          roomIds: rollupRoomIdsToSave,
          published: additionalInclude,
        },
      },
    };
    const result = await savePresentationLayoutAction(projectId, configToSave);
    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setStatus("saved");
    router.refresh();
  }, [projectId, config, rooms, roomsWithConcepts, router]);

  return (
    <div className="flex min-h-0 flex-col p-8">
      <section className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <aside className="w-80 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-700">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Pages</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={handleRefreshConcepts}
                disabled={refreshing}
                className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700 disabled:opacity-50"
              >
                {refreshing ? "…" : "Reload"}
              </button>
            </div>
          </div>
          <PageList
            items={pageListItems}
            selectedId={selectedPageId}
            onSelect={setSelectedPageId}
            sectionsExpanded={sectionsExpanded}
            onToggleSectionsExpanded={() => setSectionsExpanded((prev) => !prev)}
            onToggleRoomPublished={(roomId, published) => {
              setConfig((prev) => {
                const prevPages = prev.pages ?? {};
                const prevRooms = (prevPages.rooms ?? {}) as Record<
                  string,
                  { enabled?: boolean; variant?: string; featuredMediaId?: string | null; published?: boolean }
                >;
                const prevSections =
                  prevPages.sections && typeof prevPages.sections === "object" && !Array.isArray(prevPages.sections)
                    ? { ...prevPages.sections }
                    : {};
                const currentRoom = prevRooms[roomId] ?? {
                  enabled: true,
                  variant: "split",
                  published: true,
                };
                const currentSection = (prevSections as Record<string, SectionPageConfig>)[roomId];
                const nextSection: SectionPageConfig = {
                  include: published,
                  layoutVariant: currentSection?.layoutVariant ?? "split",
                  featuredConceptMediaId: currentSection?.featuredConceptMediaId ?? null,
                };
                return {
                  ...prev,
                  pages: {
                    ...prevPages,
                    rooms: {
                      ...prevRooms,
                      [roomId]: { ...currentRoom, enabled: published, published },
                    },
                    sections: { ...prevSections, [roomId]: nextSection },
                  },
                };
              });
            }}
            onToggleAdditionalSectionsPublished={(published) => {
              setConfig((prev) => {
                const prevPages = prev.pages ?? {};
                const prevSections =
                  prevPages.sections && typeof prevPages.sections === "object" && !Array.isArray(prevPages.sections)
                    ? { ...prevPages.sections }
                    : {};
                return {
                  ...prev,
                  pages: {
                    ...prevPages,
                    sections: {
                      ...prevSections,
                      [ADDITIONAL_SECTIONS_KEY]: { include: published },
                    },
                    rollup: {
                      ...(prevPages?.rollup ?? {
                        mode: "auto",
                        variant: "simpleList",
                        roomIds: [],
                      }),
                      published,
                    },
                  },
                };
              });
            }}
            onToggleAllSectionsPublished={(published) => {
              setConfig((prev) => {
                const prevPages = prev.pages ?? {};
                const prevRooms = (prevPages.rooms ?? {}) as Record<
                  string,
                  {
                    enabled?: boolean;
                    variant?: string;
                    featuredMediaId?: string | null;
                    published?: boolean;
                  }
                >;
                const prevSections =
                  prevPages.sections && typeof prevPages.sections === "object" && !Array.isArray(prevPages.sections)
                    ? { ...prevPages.sections }
                    : {};
                const nextRooms = { ...prevRooms };
                const nextSections = { ...prevSections } as Record<string, SectionPageConfig | { include?: boolean }>;
                for (const roomId of roomsWithConcepts) {
                  const currentRoom = prevRooms[roomId] ?? {
                    enabled: true,
                    variant: "split",
                    published: true,
                  };
                  nextRooms[roomId] = { ...currentRoom, enabled: published, published };
                  const currentSection = (prevSections as Record<string, SectionPageConfig>)[roomId];
                  nextSections[roomId] = {
                    include: published,
                    layoutVariant: currentSection?.layoutVariant ?? "split",
                    featuredConceptMediaId: currentSection?.featuredConceptMediaId ?? null,
                  };
                }
                return {
                  ...prev,
                  pages: {
                    ...prevPages,
                    rooms: nextRooms,
                    sections: nextSections,
                    rollup: {
                      ...(prevPages.rollup ?? {
                        mode: "auto",
                        variant: "simpleList",
                        roomIds: [],
                      }),
                      published,
                    },
                  },
                };
              });
            }}
          />
        </aside>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-6 py-2 dark:border-zinc-700">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{selectedPageLabel}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <PageEditor
              pageId={selectedPageId}
              config={config}
              onConfigChange={setConfig}
              media={media.map((m) => ({
                id: m.id,
                url: m.url,
                kind: m.kind,
                type: m.type,
                roomId: m.roomId,
              }))}
              rooms={rooms}
              roomsWithConcepts={roomsWithConcepts}
              rollupRoomIds={rollupRoomIds}
              eligibleRollupRoomIds={eligibleRollupRoomIds}
              conceptMediaByRoom={conceptMediaByRoom}
              coverContent={coverContent}
              projectId={projectId}
              transcriptText={transcriptText}
              overviewText={overviewText}
              brandIcons={brandIcons}
              brandingAccentColor={brandingAccentColor}
              libraryPhotos={libraryPhotos}
            />
          </div>
          <div className="shrink-0 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <SaveBar
              status={status}
              errorMessage={errorMessage}
              onSave={handleSave}
              disableSave={
                config.pages?.objective?.templateId === "C" &&
                !(config.pages.objective.title ?? "").trim()
              }
            />
          </div>
        </div>
      </section>

      {/* Settings drawer */}
      {settingsOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden
            onClick={() => setSettingsOpen(false)}
          />
          <div
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            role="dialog"
            aria-label="Presentation settings"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Presentation Settings
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                aria-label="Close settings"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <SettingsTab
                config={config}
                onConfigChange={setConfig}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
