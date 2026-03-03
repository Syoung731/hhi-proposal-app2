"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPresentationMediaSnapshotAction,
  savePresentationLayoutAction,
} from "./actions";
import { PageList } from "./page-list";
import { PageEditor } from "./page-editor";
import { SettingsTab } from "./settings-tab";
import { SaveBar } from "./save-bar";
import type { PresentationConfigSaved } from "@/app/lib/layout-config";
import type { PageListItem, PresentationPageId } from "./types";
import { normalizePresentationConfig } from "./types";

type MediaItem = {
  id: string;
  url: string;
  kind: string;
  type?: string;
  roomId?: string | null;
  parentMediaId?: string | null;
};
type RoomItem = { id: string; name: string };

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

/** Rollup = rooms that do NOT have a concept page, OR have a concept page with includeInProposal (enabled) === false. Order = rooms order. */
function computeRollupRoomIds(
  rooms: RoomItem[],
  roomsWithConcepts: string[],
  config: PresentationConfigSaved
): string[] {
  const p = config.pages ?? {};
  const roomsConfig = p.rooms ?? {};
  return rooms.filter((r) => {
    const hasConceptPage = roomsWithConcepts.includes(r.id);
    if (!hasConceptPage) return true;
    const roomCfg = roomsConfig[r.id];
    return roomCfg?.enabled === false;
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
      { id: "transitions", label: "Transitions", kind: "transitions" },
    ];
    if (hasAnyConceptRooms) {
      for (const room of rooms) {
        if (roomsWithConcepts.includes(room.id)) {
          const count = conceptCountByRoom.get(room.id) ?? 0;
          items.push({
            id: `room:${room.id}` as PresentationPageId,
            label: room.name,
            kind: "room",
            roomId: room.id,
            badge: count > 0 ? count : undefined,
          });
        }
      }
    }
    items.push({
      id: "rollup",
      label: "Additional Sections",
      kind: "rollup",
      badge: rollupRoomIds.length,
    });
    return items;
  }, [rooms, roomsWithConcepts, rollupRoomIds.length, conceptCountByRoom, hasAnyConceptRooms]);

  useEffect(() => {
    if (selectedPageId && !pageListItems.some((i) => i.id === selectedPageId)) {
      setSelectedPageId("cover");
    }
  }, [selectedPageId, pageListItems]);

  const selectedPageLabel = useMemo(() => {
    if (!selectedPageId) return "Editor";
    const item = pageListItems.find((i) => i.id === selectedPageId);
    return item?.label ?? "Editor";
  }, [selectedPageId, pageListItems]);

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
    const roomsToPersist: Record<string, { enabled?: boolean; variant?: string; featuredMediaId?: string | null }> = {};
    for (const roomId of roomsWithConcepts) {
      const roomCfg = config.pages?.rooms?.[roomId] ?? { enabled: true, variant: "beforeAfter" };
      roomsToPersist[roomId] = {
        enabled: roomCfg.enabled,
        variant: roomCfg.variant,
        featuredMediaId: roomCfg.featuredMediaId ?? null,
      };
    }
    const configToSave: PresentationConfigSaved = {
      ...config,
      pages: {
        ...config.pages,
        rooms: roomsToPersist,
        rollup: {
          ...config.pages?.rollup,
          mode: rollupMode,
          variant: config.pages?.rollup?.variant ?? "simpleList",
          roomIds: rollupRoomIdsToSave,
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
