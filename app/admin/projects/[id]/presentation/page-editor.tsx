"use client";

import { useMemo, useRef, useLayoutEffect, useState } from "react";
import Link from "next/link";
import type { PresentationConfigSaved, PublicLayoutConfig } from "@/app/lib/layout-config";
import { getLayoutConfig } from "@/app/lib/layout-config";
import type { PresentationPageId } from "./types";
import { ReorderableList } from "@/components/ui/reorderable-list";
import { CoverRenderer } from "@/components/public/cover";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const selectClass =
  "w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

type MediaOption = { id: string; url: string; kind: string; type?: string; roomId?: string | null };
type RoomOption = { id: string; name: string };

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
};

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
}: PageEditorProps) {
  const p = config.pages ?? {};
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

  const mergedCoverConfig = useMemo(
    () => getLayoutConfig(config).pages.cover,
    [config]
  );

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
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Objective Page
        </h2>
        <div>
          <label htmlFor="objective-variant" className={labelClass}>
            Layout variant
          </label>
          <select
            id="objective-variant"
            className={selectClass}
            value={p.objective?.variant ?? "twoColGallery"}
            onChange={(e) =>
              updatePages({
                objective: {
                  variant: e.target.value as "twoColGallery" | "fullBleedQuote",
                },
              })
            }
          >
            <option value="twoColGallery">Two column with gallery</option>
            <option value="fullBleedQuote">Full-bleed quote</option>
          </select>
        </div>
      </div>
    );
  }

  if (pageId === "whyUs") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Why Us Page
        </h2>
        <div>
          <label htmlFor="whyUs-variant" className={labelClass}>
            Layout variant
          </label>
          <select
            id="whyUs-variant"
            className={selectClass}
            value={p.whyUs?.variant ?? "gridCards"}
            onChange={(e) =>
              updatePages({
                whyUs: {
                  variant: e.target.value as "gridCards" | "iconRows",
                },
              })
            }
          >
            <option value="gridCards">Grid cards</option>
            <option value="iconRows">Icon rows</option>
          </select>
        </div>
      </div>
    );
  }

  if (pageId === "transitions") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Transitions
        </h2>
        <div>
          <label htmlFor="transitions-mode" className={labelClass}>
            Page transition
          </label>
          <select
            id="transitions-mode"
            className={selectClass}
            value={config.transitions?.mode ?? "fade"}
            onChange={(e) =>
              update({
                transitions: {
                  mode: e.target.value as "none" | "fade" | "slide",
                },
              })
            }
          >
            <option value="none">None</option>
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
          </select>
        </div>
      </div>
    );
  }

  if (pageId === "rollup") {
    const rollupMode = p.rollup?.mode ?? "auto";
    const rollupRooms = rooms.filter((r) => rollupRoomIds.includes(r.id));
    const eligibleRooms = rooms.filter((r) => eligibleRollupRoomIds.includes(r.id));
    const manualRoomIds = p.rollup?.roomIds ?? [];

    const setRollupMode = (mode: "auto" | "manual") => {
      updatePages({
        rollup: {
          ...p.rollup,
          mode,
          roomIds: mode === "manual" ? eligibleRollupRoomIds : [],
        },
      });
    };
    const setManualRoomIds = (ids: string[]) => {
      updatePages({ rollup: { ...p.rollup, mode: "manual", roomIds: ids } });
    };
    const toggleManualRoom = (roomId: string, included: boolean) => {
      if (included) setManualRoomIds(manualRoomIds.filter((id) => id !== roomId));
      else setManualRoomIds([...manualRoomIds, roomId]);
    };

    const includedItems = manualRoomIds.map((id) => ({ id }));
    const notIncludedRooms = eligibleRooms.filter(
      (r) => !manualRoomIds.includes(r.id)
    );

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Additional Sections
        </h2>
        <div>
          <span className={labelClass}>Selection</span>
          <div className="mt-1 flex rounded-lg border border-zinc-300 dark:border-zinc-600 overflow-hidden">
            <button
              type="button"
              onClick={() => setRollupMode("auto")}
              className={`flex-1 px-3 py-2 text-sm font-medium ${
                rollupMode === "auto"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100"
                  : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => setRollupMode("manual")}
              className={`flex-1 px-3 py-2 text-sm font-medium ${
                rollupMode === "manual"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100"
                  : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              Manual
            </button>
          </div>
        </div>
        {rollupMode === "auto" ? (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Sections without concept pages or disabled concept pages will be grouped here.
            </p>
            <div>
              <p className={labelClass}>Sections included (read-only)</p>
              <ul className="list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
                {rollupRooms.length === 0
                  ? "No sections in rollup."
                  : rollupRooms.map((r) => (
                      <li key={r.id}>{r.name}</li>
                    ))}
              </ul>
            </div>
          </>
        ) : (
          <div>
            <p className={labelClass}>Choose and order sections for Additional Sections</p>
            {includedItems.length > 0 && (
              <ReorderableList
                items={includedItems}
                onReorder={(newItems) =>
                  setManualRoomIds(newItems.map((item) => item.id))
                }
                renderItem={(item) => {
                  const room = rooms.find((r) => r.id === item.id);
                  return (
                    <label className="flex cursor-pointer items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked
                        onChange={() => toggleManualRoom(item.id, true)}
                        className="rounded border-zinc-300 dark:border-zinc-600"
                      />
                      <span className="truncate text-sm text-zinc-800 dark:text-zinc-200">
                        {room?.name ?? item.id}
                      </span>
                    </label>
                  );
                }}
                className="mt-1"
              />
            )}
            {notIncludedRooms.length > 0 && (
              <div className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2">
                <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Add sections
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {notIncludedRooms.map((room) => (
                    <label
                      key={room.id}
                      className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleManualRoom(room.id, false)}
                        className="rounded border-zinc-300 dark:border-zinc-600"
                      />
                      {room.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {eligibleRooms.length === 0 && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                No sections eligible for rollup.
              </p>
            )}
          </div>
        )}
        <div>
          <label htmlFor="rollup-variant" className={labelClass}>
            Layout variant
          </label>
          <select
            id="rollup-variant"
            className={selectClass}
            value={p.rollup?.variant ?? "simpleList"}
            onChange={(e) =>
              updatePages({
                rollup: { ...p.rollup, variant: e.target.value as "simpleList" },
              })
            }
          >
            <option value="simpleList">Simple list</option>
          </select>
        </div>
      </div>
    );
  }

  if (pageId.startsWith("room:")) {
    const roomId = pageId.slice(5);
    const room = rooms.find((r) => r.id === roomId);
    const roomConfig = p.rooms?.[roomId] ?? { enabled: true, variant: "beforeAfter" };
    const concepts = conceptMediaByRoom[roomId] ?? [];
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {room?.name ?? "Section"}
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="room-enabled"
            checked={roomConfig.enabled !== false}
            onChange={(e) =>
              updatePages({
                rooms: {
                  ...p.rooms,
                  [roomId]: { ...roomConfig, enabled: e.target.checked },
                },
              })
            }
          />
          <label htmlFor="room-enabled" className="text-sm font-medium">
            Include in proposal (show as own page)
          </label>
        </div>
        <div>
          <label htmlFor="room-variant" className={labelClass}>
            Layout variant
          </label>
          <select
            id="room-variant"
            className={selectClass}
            value={roomConfig.variant ?? "beforeAfter"}
            onChange={(e) =>
              updatePages({
                rooms: {
                  ...p.rooms,
                  [roomId]: { ...roomConfig, variant: e.target.value },
                },
              })
            }
          >
            <option value="beforeAfter">Before / After</option>
            <option value="gallery">Gallery</option>
          </select>
        </div>
        {concepts.length > 0 && (
          <div>
            <label htmlFor="room-featured" className={labelClass}>
              Featured concept image
            </label>
            <select
              id="room-featured"
              className={selectClass}
              value={roomConfig.featuredMediaId ?? ""}
              onChange={(e) =>
                updatePages({
                  rooms: {
                    ...p.rooms,
                    [roomId]: {
                      ...roomConfig,
                      featuredMediaId: e.target.value || null,
                    },
                  },
                })
              }
            >
              <option value="">Default (selected render)</option>
              {concepts.map((c) => (
                <option key={c.id} value={c.id}>
                  Concept — {c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  return null;
}
