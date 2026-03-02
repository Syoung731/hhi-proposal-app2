"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderMediaAction, startRoomRenderAction } from "./actions";
import { MediaType } from "@/app/generated/prisma";
import { isBadPlaceholderUrl, isAllowedHostForNextImage } from "@/app/lib/media";

export type MediaItem = {
  id: string;
  type: string;
  caption: string | null;
  tags: string[];
  roomId: string | null;
  url: string;
  sortOrder: number;
  room: { id: string; name: string } | null;
  fileKey?: string;
};

export type RoomItem = {
  id: string;
  name: string;
  sortOrder: number;
};

function isLegacyBlobUrl(url: string): boolean {
  return url.includes("blob.vercel-storage.com");
}

const pointerSensor = {
  activationConstraint: { distance: 8 },
};

export type MediaGridProps = {
  projectId: string;
  roomId?: string;
  items: MediaItem[];
  rooms: RoomItem[];
  /** Project-level style preset name for "Rendering: Per Scope of Work + <name>" label; null = scope only */
  projectStylePresetName?: string | null;
  onReorderSuccess: () => void;
  onDelete: (id: string) => void;
  onRenderDone?: () => void;
};

function MediaGrid({
  projectId,
  roomId,
  items,
  rooms,
  projectStylePresetName = null,
  onReorderSuccess,
  onDelete,
  onRenderDone,
}: MediaGridProps) {
  const [orderedItems, setOrderedItems] = useState(items);
  const [reorderError, setReorderError] = useState<string | null>(null);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const sensors = useSensors(useSensor(PointerSensor, pointerSensor));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedItems.findIndex((i) => i.id === active.id);
    const newIndex = orderedItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const prev = orderedItems;
    const next = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(next);
    setReorderError(null);
    const result = await reorderMediaAction(projectId, next.map((m) => m.id));
    if (result.error) {
      setOrderedItems(prev);
      setReorderError(result.error);
    } else {
      onReorderSuccess();
    }
  }

  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {reorderError && (
        <p className="text-sm text-red-600 dark:text-red-400">{reorderError}</p>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={orderedItems.map((m) => m.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {orderedItems.map((m) => (
              <SortableMediaCard
                key={m.id}
                projectId={projectId}
                roomId={roomId}
                media={m}
                projectStylePresetName={projectStylePresetName}
                onDelete={onDelete}
                onRenderDone={onRenderDone}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableMediaCard({
  projectId,
  roomId,
  media: m,
  projectStylePresetName = null,
  onDelete,
  onRenderDone,
}: {
  projectId: string;
  roomId?: string;
  media: MediaItem;
  projectStylePresetName?: string | null;
  onDelete: (id: string) => void;
  onRenderDone?: () => void;
}) {
  const router = useRouter();
  const [rendering, setRendering] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: m.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const showRenderButton = m.type === MediaType.EXISTING && roomId != null;

  async function handleRenderThis() {
    if (!projectId || !roomId || !m?.id) return;
    if (rendering) return;
    setRendering(true);
    setRenderError(null);
    try {
      const result = await startRoomRenderAction(projectId, roomId, m.id);
      if ("ok" in result && result.ok) {
        setShowDone(true);
        onRenderDone?.();
        router.refresh();
        setTimeout(() => {
          setShowDone(false);
          setRendering(false);
        }, 1000);
        return;
      }
      if ("error" in result && result.error) {
        setRenderError(result.error);
        setTimeout(() => setRenderError(null), 4000);
      }
    } catch (err) {
      console.error("Render this failed", err);
      setRenderError(err instanceof Error ? err.message : "Render failed");
      setTimeout(() => setRenderError(null), 4000);
    }
    setRendering(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 ${isDragging ? "z-10 opacity-80" : ""}`}
    >
      {/* Image area only – no <a> wraps the footer below */}
      <div className="shrink-0">
        <a
          href={isBadPlaceholderUrl(m.url) ? undefined : m.url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-zinc-200 dark:bg-zinc-700"
        >
          {isBadPlaceholderUrl(m.url) ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#f5f5f5",
                color: "#666",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontSize: 12,
                borderRadius: 8,
              }}
            >
              {m.type === MediaType.RENDERING &&
              (m.url == null || m.url.trim() === "") &&
              m.fileKey?.startsWith("renderings/pending/") ? (
                <>
                  <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden />
                  Rendering…
                </>
              ) : (
                "No image"
              )}
            </div>
          ) : isLegacyBlobUrl(m.url) || !isAllowedHostForNextImage(m.url) ? (
            <img
              src={m.url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <Image
              src={m.url}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 25vw"
              unoptimized={m.url.startsWith("blob:") || !m.url.startsWith("http")}
            />
          )}
        </a>
      </div>
      {/* Photo card footer: two-row layout */}
      <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 space-y-2 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              ref={setActivatorNodeRef}
              className="cursor-grab touch-none rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 active:cursor-grabbing dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
              {...listeners}
              {...attributes}
              title="Drag to reorder"
            >
              <GripHandleIcon />
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(m.id);
              }}
              className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-100 active:scale-[0.98] dark:border-red-800 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-900/50 dark:hover:border-red-700"
            >
              Delete
            </button>
          </div>
          {showRenderButton && (
            <button
              type="button"
              data-testid="render-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRenderThis();
              }}
              disabled={rendering}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-70 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              {rendering ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden />
                  Rendering…
                </>
              ) : showDone ? (
                "Done"
              ) : (
                "Render Photo"
              )}
            </button>
          )}
        </div>
        {showRenderButton && (
          <div className="min-h-[20px]">
            {renderError ? (
              <span className="text-xs text-red-600 dark:text-red-400" role="alert">
                {renderError}
              </span>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Rendering: Per Scope of Work{projectStylePresetName ? ` + ${projectStylePresetName}` : ""}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GripHandleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

export default MediaGrid;
