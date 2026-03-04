"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  getPresignedUploadUrlAction,
  createMediaAction,
  deleteMediaAction,
  updateMediaRoomAction,
  startRoomRenderAction,
  setSelectedRenderAction,
  clearSelectedRenderAction,
  startRenderUpdateAction,
} from "./actions";
import { ChangesDetectedSummary } from "./changes-detected-summary";
import { FrontPageHeroEditor } from "./front-page-hero-editor";
import { MediaType } from "@/app/generated/prisma";
import { isBadPlaceholderUrl, isAllowedHostForNextImage } from "@/app/lib/media";

type MediaItem = {
  id: string;
  createdAt: Date | string;
  type: string;
  kind?: string;
  caption: string | null;
  tags: string[];
  roomId: string | null;
  url: string;
  sortOrder: number;
  room: { id: string; name: string } | null;
  fileKey?: string;
  sourceMediaId?: string | null;
  parentMediaId?: string | null;
  editInstruction?: string | null;
  renderStatus?: string | null;
  renderError?: string | null;
  placement?: string;
};

type RoomItem = {
  id: string;
  name: string;
  sortOrder: number;
  selectedRenderMediaId?: string | null;
};

type Props = {
  projectId: string;
  media: MediaItem[];
  rooms: RoomItem[];
  /** Project-level style preset (Sections tab); used for render label only */
  projectStylePreset?: { id: string; name: string } | null;
  /** Selected hero media id (project.coverHeroImageId); hero thumbnail uses this or type HERO */
  coverHeroImageId?: string | null;
};

export type UploadBatchResult = {
  successCount: number;
  failed: { name: string; error: string }[];
};

/** Upload multiple files sequentially; each file: get presigned URL -> PUT -> createMedia. Continues on per-file failure. */
async function uploadFiles(
  files: File[],
  opts: {
    projectId: string;
    type: typeof MediaType.EXISTING | typeof MediaType.RENDERING;
    roomId: string;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<UploadBatchResult> {
  const failed: { name: string; error: string }[] = [];
  let successCount = 0;
  const total = files.length;
  for (let i = 0; i < files.length; i++) {
    opts.onProgress?.(i + 1, total);
    const file = files[i]!;
    try {
      const result = await getPresignedUploadUrlAction(
        opts.projectId,
        file.name,
        file.type || "application/octet-stream"
      );
      if ("error" in result) {
        failed.push({ name: file.name, error: result.error });
        continue;
      }
      const putRes = await fetch(result.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        failed.push({ name: file.name, error: "Upload failed: " + putRes.statusText });
        continue;
      }
      const formData = new FormData();
      formData.set("projectId", opts.projectId);
      formData.set("fileKey", result.fileKey);
      formData.set("url", result.publicUrl);
      formData.set("type", opts.type);
      formData.set("roomId", opts.roomId);
      const res = await createMediaAction(formData);
      if (res.error) {
        failed.push({ name: file.name, error: res.error });
      } else {
        successCount++;
      }
    } catch (e) {
      failed.push({
        name: file.name,
        error: e instanceof Error ? e.message : "Upload failed",
      });
    }
  }
  return { successCount, failed };
}

/** Legacy blob URLs (e.g. blob.vercel-storage.com) can trigger next/image remote host errors; render with plain <img> instead. */
function isLegacyBlobUrl(url: string): boolean {
  return url.includes("blob.vercel-storage.com");
}

const POLL_INTERVAL_MS = 7000;
export const FRONT_PAGE_ID = "__front_page__";

/** Resolve root id by walking parentMediaId; if parent missing, return self (orphan). */
function resolveRootId(byId: Map<string, MediaItem>, item: MediaItem): string {
  if (!item.parentMediaId) return item.id;
  const parent = byId.get(item.parentMediaId);
  return parent ? resolveRootId(byId, parent) : item.id;
}

/** Group renders by root (parentMediaId null). Children have parentMediaId === root.id. Orphan children become their own root. */
function buildRenderGroups(
  items: MediaItem[],
  sourceMediaId: string | null
): { rootId: string; root: MediaItem; children: MediaItem[]; allInOrder: MediaItem[] }[] {
  if (!sourceMediaId || !items.length) return [];
  const bySource = items.filter((m) => m.sourceMediaId === sourceMediaId);
  const byId = new Map(bySource.map((m) => [m.id, m]));
  const rootIds = new Set<string>();
  for (const m of bySource) {
    if (m.parentMediaId == null) rootIds.add(m.id);
  }
  for (const m of bySource) {
    if (m.parentMediaId != null) {
      const rid = resolveRootId(byId, m);
      if (!rootIds.has(rid)) rootIds.add(m.id);
    }
  }
  const roots = bySource.filter((m) => rootIds.has(m.id));
  const sortByOrder = (a: MediaItem, b: MediaItem) =>
    a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  roots.sort(sortByOrder);
  const groups: { rootId: string; root: MediaItem; children: MediaItem[]; allInOrder: MediaItem[] }[] = [];
  for (const root of roots) {
    const rootId = root.id;
    const children = bySource.filter((m) => m.parentMediaId === rootId).sort(sortByOrder);
    const allInOrder = [root, ...children];
    groups.push({ rootId, root, children, allInOrder });
  }
  return groups;
}

type ConceptGroup = {
  rootId: string;
  root: MediaItem;
  children: MediaItem[];
  allInOrder: MediaItem[];
  conceptIndex: number;
  conceptLabel: string;
  versions: MediaItem[];
};

const CONCEPT_LABELS = ["Concept A", "Concept B", "Concept C"] as const;

/** Map render groups to concept groups with stable labels (by createdAt/sortOrder). */
function buildConceptGroups(
  groups: { rootId: string; root: MediaItem; children: MediaItem[]; allInOrder: MediaItem[] }[]
): ConceptGroup[] {
  return groups.map((g, i) => ({
    ...g,
    conceptIndex: i,
    conceptLabel: CONCEPT_LABELS[i] ?? `Concept ${i + 1}`,
    versions: g.allInOrder,
  }));
}

/** Version label within a concept: root = v1, updates = v1.1, v1.2, v1.3. */
function getVersionLabel(group: ConceptGroup, media: MediaItem): string {
  if (media.id === group.root.id) return "v1";
  const idx = group.children.findIndex((c) => c.id === media.id);
  return idx >= 0 ? `v1.${idx + 1}` : "v1";
}

/** UI-only: treat missing status as DONE when url is present so completed renders allow Set Selected / Update. */
function getNormalizedRenderStatus(render: MediaItem): string {
  return render.renderStatus ?? (render.url ? "DONE" : "PENDING");
}

/** Tooltip lines for a render thumbnail. */
function getThumbnailTooltip(media: MediaItem, group: ConceptGroup, parentLabel: string): string {
  const lines: string[] = [];
  const created = new Date(media.createdAt);
  lines.push(`Created: ${created.toLocaleString()}`);
  if (media.parentMediaId) {
    lines.push(parentLabel);
  }
  if (media.editInstruction?.trim()) {
    lines.push(`Instruction: ${media.editInstruction.trim().slice(0, 120)}${media.editInstruction.length > 120 ? "…" : ""}`);
  }
  if (media.renderStatus === "FAILED" && media.renderError?.trim()) {
    lines.push(`Error: ${media.renderError.trim().slice(0, 120)}${media.renderError.length > 120 ? "…" : ""}`);
  }
  return lines.join("\n");
}

/** Latest DONE in list by createdAt (uses normalized status so url-without-status counts as DONE). */
function latestDone(items: MediaItem[]): MediaItem | null {
  const done = items.filter((m) => getNormalizedRenderStatus(m) === "DONE");
  if (!done.length) return null;
  return done.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

export function MediaTab({ projectId, media, rooms, projectStylePreset = null, coverHeroImageId = null }: Props) {
  const router = useRouter();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadBatchResult | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(FRONT_PAGE_ID);
  const [activeSourceMediaId, setActiveSourceMediaId] = useState<string | null>(null);
  const [activeRenderMediaId, setActiveRenderMediaId] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [updateModalRenderId, setUpdateModalRenderId] = useState<string | null>(null);
  const [updateInstruction, setUpdateInstruction] = useState("");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSubmitting, setUpdateSubmitting] = useState(false);
  /** Optimistic placeholder media for just-queued update renders (until server data arrives). */
  const [optimisticRenderMedia, setOptimisticRenderMedia] = useState<MediaItem[]>([]);

  const roomIds = new Set(rooms.map((r) => r.id));
  const existingByRoom = (roomId: string) =>
    media
      .filter((m) => m.type === MediaType.EXISTING && m.roomId === roomId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const renderingsByRoom = (roomId: string) =>
    media
      .filter((m) => m.type === MediaType.RENDERING && m.roomId === roomId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const unassigned = media.filter(
    (m) =>
      m.type !== MediaType.HERO &&
      (m.placement === "UNASSIGNED" ||
        (m.placement == null && (m.roomId == null || !roomIds.has(m.roomId))))
  );

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;
  const existingForActive = activeRoomId ? existingByRoom(activeRoomId) : [];
  const serverRenderingsForActive = activeRoomId ? renderingsByRoom(activeRoomId) : [];
  // Merge optimistic placeholders so "Generating…" appears immediately in the version strip
  const renderingsForActive = (() => {
    if (!activeRoomId || !serverRenderingsForActive.length) return serverRenderingsForActive;
    const serverIds = new Set(serverRenderingsForActive.map((m) => m.id));
    const extra = optimisticRenderMedia.filter(
      (o) => o.roomId === activeRoomId && !serverIds.has(o.id)
    );
    if (!extra.length) return serverRenderingsForActive;
    return [...serverRenderingsForActive, ...extra].sort(
      (a, b) => a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  })();
  const rootRenderCount = renderingsForActive.filter((m) => m.parentMediaId == null).length;
  const selectedRenderIdOnRoom = activeRoom?.selectedRenderMediaId ?? null;
  const selectedRenderMedia = selectedRenderIdOnRoom
    ? renderingsForActive.find((m) => m.id === selectedRenderIdOnRoom)
    : null;

  const defaultSourceForRoom =
    (selectedRenderMedia?.sourceMediaId as string | null | undefined) ??
    existingForActive[0]?.id ??
    null;

  const selectedBefore =
    activeSourceMediaId != null
      ? existingForActive.find((m) => m.id === activeSourceMediaId) ?? existingForActive[0] ?? null
      : existingForActive[0] ?? null;

  const effectiveSourceMediaId = selectedBefore?.id ?? defaultSourceForRoom;

  // Only RENDERING media for the selected before photo in this room (single source of truth for "concepts for this photo")
  const conceptVersionsForSelectedBefore =
    effectiveSourceMediaId != null && activeRoomId != null
      ? renderingsForActive.filter(
          (r) => r.sourceMediaId === effectiveSourceMediaId && r.roomId === activeRoomId
        )
      : [];
  const filteredRenders = conceptVersionsForSelectedBefore;
  const renderGroups = buildRenderGroups(renderingsForActive, effectiveSourceMediaId ?? null);
  const conceptGroups = buildConceptGroups(renderGroups);
  const latestDoneInFiltered = latestDone(filteredRenders);

  // Priority: 1) viewing (clicked thumb), 2) selected (if DONE and in filtered), 3) latest DONE
  const selectedInFilteredAndDone =
    selectedRenderIdOnRoom && filteredRenders.some((r) => r.id === selectedRenderIdOnRoom)
      ? filteredRenders.find((r) => r.id === selectedRenderIdOnRoom && getNormalizedRenderStatus(r) === "DONE") ?? null
      : null;
  const viewingInFiltered =
    activeRenderMediaId && filteredRenders.some((r) => r.id === activeRenderMediaId)
      ? filteredRenders.find((r) => r.id === activeRenderMediaId) ?? null
      : null;
  const bigPreviewMedia =
    viewingInFiltered ??
    selectedInFilteredAndDone ??
    latestDoneInFiltered;

  const hasPendingRenders = renderingsForActive.some(
    (m) => getNormalizedRenderStatus(m) === "QUEUED" || getNormalizedRenderStatus(m) === "RENDERING"
  );

  // Remove optimistic placeholders once server data includes them
  useEffect(() => {
    const serverIds = new Set(media.filter((m) => m.type === MediaType.RENDERING).map((m) => m.id));
    setOptimisticRenderMedia((prev) => prev.filter((o) => !serverIds.has(o.id)));
  }, [media]);

  useEffect(() => {
    if (!activeRoomId || !hasPendingRenders) return;
    const t = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [activeRoomId, hasPendingRenders, router]);

  useEffect(() => {
    setActiveRoomId((prev) =>
      prev && (prev === FRONT_PAGE_ID || roomIds.has(prev)) ? prev : rooms[0]?.id ?? null
    );
  }, [rooms, roomIds]);
  useEffect(() => {
    const firstBefore = existingForActive[0]?.id ?? null;
    const preferredSourceId =
      (selectedRenderMedia?.sourceMediaId as string | null | undefined) ?? firstBefore ?? null;

    setActiveSourceMediaId((prev) => {
      if (prev && existingForActive.some((m) => m.id === prev)) {
        return prev;
      }
      return preferredSourceId;
    });
  }, [activeRoomId, existingForActive, selectedRenderMedia?.sourceMediaId]);

  useEffect(() => {
    const inFiltered = (id: string) => filteredRenders.some((r) => r.id === id);
    const defaultId = selectedRenderIdOnRoom && inFiltered(selectedRenderIdOnRoom)
      ? selectedRenderIdOnRoom
      : latestDoneInFiltered?.id ?? null;
    setActiveRenderMediaId((prev) => {
      if (prev && inFiltered(prev)) return prev;
      return defaultId;
    });
  }, [activeRoomId, effectiveSourceMediaId, selectedRenderIdOnRoom, latestDoneInFiltered?.id]);

  async function handleRenderNew() {
    if (!activeRoomId || !effectiveSourceMediaId || rendering) return;
    setRendering(true);
    setRenderError(null);
    const result = await startRoomRenderAction(projectId, activeRoomId, effectiveSourceMediaId);
    setRendering(false);
    if ("error" in result) {
      setRenderError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleSetSelected(mediaId: string) {
    if (!activeRoomId) return;
    const err = await setSelectedRenderAction(projectId, activeRoomId, mediaId);
    if (err?.error) setRenderError(err.error);
    else router.refresh();
  }

  async function handleClearSelected() {
    if (!activeRoomId) return;
    const result = await clearSelectedRenderAction(projectId, activeRoomId);
    if (result?.error) setRenderError(result.error);
    else router.refresh();
  }

  async function handleDeleteRender(mediaId: string) {
    if (!confirm("Delete this rendering?")) return;
    await deleteMediaAction(projectId, mediaId);
    router.refresh();
  }

  function openUpdateModal(renderId: string) {
    setUpdateModalRenderId(renderId);
    setUpdateInstruction("");
    setUpdateError(null);
  }

  function closeUpdateModal() {
    setUpdateModalRenderId(null);
    setUpdateInstruction("");
    setUpdateError(null);
  }

  function canSubmitUpdate(): boolean {
    const instruction = updateInstruction.trim();
    return instruction.length >= 3 && instruction.length <= 500;
  }

  async function handleSubmitUpdate() {
    if (!activeRoomId || !updateModalRenderId) return;
    const instruction = updateInstruction.trim();
    if (instruction.length < 3) {
      setUpdateError("Instruction must be at least 3 characters.");
      return;
    }
    if (instruction.length > 500) {
      setUpdateError("Instruction must be 500 characters or less.");
      return;
    }
    setUpdateSubmitting(true);
    setUpdateError(null);
    const result = await startRenderUpdateAction(
      projectId,
      activeRoomId,
      updateModalRenderId,
      instruction
    );
    setUpdateSubmitting(false);
    if ("error" in result) {
      setUpdateError(result.error);
      return;
    }
    const newMediaId = result.mediaId ?? result.createdMediaId;
    // Placeholder must have parentMediaId = root of concept so it appears in same group (UI groups by root's direct children only).
    const groupForUpdated = conceptGroups.find((g) => g.versions.some((v) => v.id === updateModalRenderId));
    const rootIdForPlaceholder = groupForUpdated?.root.id ?? updateModalRenderId;
    const maxSortOrderInConcept = groupForUpdated
      ? Math.max(
          groupForUpdated.root.sortOrder,
          ...groupForUpdated.children.map((m) => m.sortOrder),
          0
        ) + 1
      : Math.max(0, ...renderingsForActive.map((m) => m.sortOrder)) + 1;
    const placeholder: MediaItem = {
      id: newMediaId,
      createdAt: new Date().toISOString(),
      type: MediaType.RENDERING,
      caption: null,
      tags: [],
      roomId: activeRoomId,
      url: "",
      sortOrder: maxSortOrderInConcept,
      room: activeRoom ? { id: activeRoom.id, name: activeRoom.name } : null,
      sourceMediaId: effectiveSourceMediaId ?? undefined,
      parentMediaId: rootIdForPlaceholder,
      renderStatus: "QUEUED",
    };
    setOptimisticRenderMedia((prev) => [...prev, placeholder]);
    setActiveRenderMediaId(newMediaId);
    closeUpdateModal();
    router.refresh();
  }

  function handleUpdateModalKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      if (!canSubmitUpdate()) return;
      void handleSubmitUpdate();
    }
  }

  // Precompute for Render preview (avoids IIFE in JSX)
  const bigPreviewRenderStatus = bigPreviewMedia ? getNormalizedRenderStatus(bigPreviewMedia) : null;
  const bigPreviewShowSpinner =
    bigPreviewMedia &&
    ((bigPreviewRenderStatus === "QUEUED" || bigPreviewRenderStatus === "RENDERING") ||
      isBadPlaceholderUrl(bigPreviewMedia.url));
  const bigPreviewUsePlainImg =
    bigPreviewMedia &&
    !bigPreviewShowSpinner &&
    (isLegacyBlobUrl(bigPreviewMedia.url) || !isAllowedHostForNextImage(bigPreviewMedia.url));

  // Precompute for concept labels (avoids IIFE in JSX)
  const viewingGroup = conceptGroups.find((cg) => cg.versions.some((v) => v.id === activeRenderMediaId));
  const viewingMedia = viewingGroup?.versions.find((v) => v.id === activeRenderMediaId);
  const viewingLabel =
    viewingGroup && viewingMedia
      ? `${viewingGroup.conceptLabel} — ${getVersionLabel(viewingGroup, viewingMedia)}`
      : null;
  const selectedGroup = conceptGroups.find((cg) => cg.versions.some((v) => v.id === selectedRenderIdOnRoom));
  const selectedMedia = selectedGroup?.versions.find((v) => v.id === selectedRenderIdOnRoom);
  const selectedLabel =
    selectedGroup && selectedMedia && selectedRenderIdOnRoom
      ? `${selectedGroup.conceptLabel} — ${getVersionLabel(selectedGroup, selectedMedia)}`
      : null;

  return (
    <div className="space-y-8">
      {uploadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
      )}
      {uploadResult != null && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
          <p className="text-zinc-800 dark:text-zinc-200">
            Uploaded {uploadResult.successCount} file{uploadResult.successCount !== 1 ? "s" : ""}.
            {uploadResult.failed.length > 0 && (
              <> {uploadResult.failed.length} failed.</>
            )}
          </p>
          {uploadResult.failed.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-red-600 dark:text-red-400">
              {uploadResult.failed.map((f) => (
                <li key={f.name}>
                  {f.name}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {/* Media workspace: room list (left) + active room (right) */}
      <section className="flex gap-0 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <aside className="w-80 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="p-2 font-medium text-zinc-700 dark:text-zinc-300">Sections</div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => setActiveRoomId(FRONT_PAGE_ID)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                activeRoomId === FRONT_PAGE_ID
                  ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                  : "border-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-700/50"
              }`}
            >
              <span className="truncate font-medium">Front Page</span>
              {coverHeroImageId && (
                <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  Selected
                </span>
              )}
            </button>
            {rooms.map((room) => {
              const roomRenders = renderingsByRoom(room.id);
              const roots = roomRenders.filter((r) => r.parentMediaId == null).length;
              const isSelected = room.selectedRenderMediaId != null;
              const active = room.id === activeRoomId;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setActiveRoomId(room.id)}
                  className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                    active
                      ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                      : "border-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-700/50"
                  }`}
                >
                  <span className="truncate font-medium">{room.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-600">
                      Concepts: {roots}/3
                    </span>
                    {isSelected && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        Selected
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
        <div className="min-w-0 flex-1 p-6">
          {activeRoomId === FRONT_PAGE_ID ? (
            <FrontPageHeroEditor
              projectId={projectId}
              media={media}
              coverHeroImageId={coverHeroImageId ?? null}
            />
          ) : activeRoom ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {activeRoom.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <ExistingUploadButton
                    projectId={projectId}
                    roomId={activeRoom.id}
                    onSuccess={() => router.refresh()}
                    onError={setUploadError}
                    onBatchResult={setUploadResult}
                  />
                </div>
              </div>
              {rootRenderCount >= 3 && (
                <p className="mb-2 text-sm text-amber-600 dark:text-amber-400">
                  Max 3 concepts per room. Delete one to generate another.
                </p>
              )}
              {renderError && (
                <p className="mb-2 text-sm text-red-600 dark:text-red-400">{renderError}</p>
              )}
              <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
                Rendering: Per Scope of Work
                {projectStylePreset?.name ? ` + ${projectStylePreset.name}` : ""}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Before</p>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                    {selectedBefore ? (
                      isLegacyBlobUrl(selectedBefore.url) || !isAllowedHostForNextImage(selectedBefore.url) ? (
                        <img
                          src={selectedBefore.url}
                          alt="Before"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Image
                          src={selectedBefore.url}
                          alt="Before"
                          fill
                          className="object-cover"
                          sizes="(max-width:768px) 50vw, 25vw"
                          unoptimized={
                            selectedBefore.url.startsWith("blob:") || !selectedBefore.url.startsWith("http")
                          }
                        />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                        Upload/select a photo
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Render</p>
                    {bigPreviewMedia && selectedRenderIdOnRoom === bigPreviewMedia.id && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/50 dark:text-green-300">
                        Selected for Proposal
                      </span>
                    )}
                    {selectedRenderIdOnRoom && (
                      <button
                        type="button"
                        onClick={handleClearSelected}
                        className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                      >
                        Clear Selected
                      </button>
                    )}
                  </div>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                    {bigPreviewMedia ? (
                      bigPreviewShowSpinner ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
                          <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                          {bigPreviewRenderStatus === "QUEUED" ? "Queued…" : "Rendering…"}
                        </div>
                      ) : bigPreviewUsePlainImg ? (
                        <img
                          src={bigPreviewMedia.url}
                          alt="Render"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Image
                          src={bigPreviewMedia.url}
                          alt="Render"
                          fill
                          className="object-cover"
                          sizes="(max-width:768px) 50vw, 25vw"
                          unoptimized={
                            bigPreviewMedia.url.startsWith("blob:") || !bigPreviewMedia.url.startsWith("http")
                          }
                        />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                        No concepts yet for this photo
                      </div>
                    )}
                  </div>
                  {bigPreviewMedia && conceptGroups.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {viewingLabel && <p>Viewing: {viewingLabel}</p>}
                      {selectedRenderIdOnRoom && selectedLabel && (
                        <p className={activeRenderMediaId === selectedRenderIdOnRoom ? "text-green-600 dark:text-green-400" : ""}>
                          Selected for Proposal: {selectedLabel}
                        </p>
                      )}
                    </div>
                  )}
                  {bigPreviewMedia?.sourceMediaId && !bigPreviewShowSpinner && bigPreviewMedia.url && (
                    <ChangesDetectedSummary
                      projectId={projectId}
                      sourceMediaId={bigPreviewMedia.sourceMediaId}
                      renderMediaId={bigPreviewMedia.id}
                    />
                  )}
                </div>
              </div>

              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Existing Photos
                </p>
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Photos in this section (before/context). Select one to view or create rendered versions below.
                </p>
                <div className="flex flex-wrap gap-2">
                  {existingForActive.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setActiveSourceMediaId(m.id)}
                      className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                        m.id === effectiveSourceMediaId
                          ? "border-zinc-900 dark:border-zinc-100"
                          : "border-zinc-200 dark:border-zinc-600"
                      }`}
                    >
                      {isLegacyBlobUrl(m.url) || !isAllowedHostForNextImage(m.url) ? (
                        <img src={m.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Image
                          src={m.url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="56px"
                          unoptimized={m.url.startsWith("blob:") || !m.url.startsWith("http")}
                        />
                      )}
                    </button>
                  ))}
                  {existingForActive.length === 0 && (
                    <p className="text-sm text-zinc-500">Upload an existing photo first.</p>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Rendered Photos
                </p>
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  AI renderings for this section, grouped by source photo. Select a source above to see or create concepts.
                </p>
                {effectiveSourceMediaId != null && rootRenderCount >= 3 && (
                  <p className="mb-2 text-sm text-amber-600 dark:text-amber-400">
                    Max 3 concepts per room. Delete one to add another.
                  </p>
                )}
                {effectiveSourceMediaId == null ? (
                  <p className="text-sm text-zinc-500">
                    Select a before photo above to see or create concepts.
                  </p>
                ) : conceptVersionsForSelectedBefore.length === 0 ? (
                  <div className="flex flex-col items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 py-6 dark:border-zinc-700 dark:bg-zinc-800/30">
                    <p className="px-4 text-sm text-zinc-600 dark:text-zinc-400">
                      No concepts yet for this photo
                    </p>
                    <button
                      type="button"
                      disabled={rendering || !effectiveSourceMediaId}
                      onClick={handleRenderNew}
                      className="ml-4 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      {rendering ? "Rendering…" : "Render New"}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {conceptGroups.map((group) => {
                      const activeInConcept = group.versions.find((m) => m.id === activeRenderMediaId);
                      const selectedInConcept = selectedRenderIdOnRoom
                        ? group.versions.find((v) => v.id === selectedRenderIdOnRoom)
                        : null;
                      const conceptActiveMediaId =
                        activeInConcept ??
                        selectedInConcept ??
                        latestDone(group.versions) ??
                        group.root;
                      const conceptActiveNormalizedStatus = getNormalizedRenderStatus(conceptActiveMediaId);
                      const updatesCount = group.children.length;
                      const updateDisabled = updatesCount >= 3;
                      return (
                        <div
                          key={group.rootId}
                          className="flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1 px-2 pt-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                {group.conceptLabel}
                              </p>
                              {group.versions.some((v) => v.id === activeRenderMediaId) && (
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                                  Viewing
                                </span>
                              )}
                              {selectedRenderIdOnRoom && group.versions.some((v) => v.id === selectedRenderIdOnRoom) && (
                                <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                  Selected for Proposal
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              Versions: {group.versions.map((m) => getVersionLabel(group, m)).join(", ")}
                            </p>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 px-2">
                            {group.versions.map((m) => {
                              const isViewing = m.id === activeRenderMediaId;
                              const isSelected = activeRoom?.selectedRenderMediaId === m.id;
                              const parentLabel = m.parentMediaId ? "Updated from v1" : "";
                              const tooltip = getThumbnailTooltip(m, group, parentLabel);
                              const normalizedStatus = getNormalizedRenderStatus(m);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setActiveRenderMediaId(m.id)}
                                  title={tooltip}
                                  className={`relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg border-2 transition-shadow ${
                                    isViewing
                                      ? "ring-2 ring-blue-600 ring-offset-1 border-blue-500 dark:ring-offset-zinc-900"
                                      : isSelected
                                        ? "ring-2 ring-green-500 ring-offset-1 border-green-500 dark:ring-offset-zinc-900"
                                        : "border-zinc-200 dark:border-zinc-600"
                                  }`}
                                >
                                  {normalizedStatus === "QUEUED" || normalizedStatus === "RENDERING" ? (
                                    <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-100 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                                      Generating…
                                    </span>
                                  ) : normalizedStatus === "FAILED" ? (
                                    <span className="flex h-full w-full items-center justify-center bg-red-100 text-xs dark:bg-red-900/50 dark:text-red-300">
                                      ✕
                                    </span>
                                  ) : !isBadPlaceholderUrl(m.url) ? (
                                    isLegacyBlobUrl(m.url) || !isAllowedHostForNextImage(m.url) ? (
                                      <img src={m.url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <Image
                                        src={m.url}
                                        alt=""
                                        fill
                                        className="object-cover"
                                        sizes="72px"
                                        unoptimized={m.url.startsWith("blob:") || !m.url.startsWith("http")}
                                      />
                                    )
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center bg-zinc-100 text-[10px] text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                                      No image
                                    </span>
                                  )}
                                  {isSelected && (
                                    <span className="absolute bottom-0 left-0 right-0 bg-green-600 py-0.5 text-center text-[10px] font-medium text-white">
                                      Selected for Proposal
                                    </span>
                                  )}
                                  <span className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                                    {getVersionLabel(group, m)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-zinc-200 px-2 py-2 dark:border-zinc-700">
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs ${
                                conceptActiveNormalizedStatus === "DONE"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                                  : conceptActiveNormalizedStatus === "FAILED"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                              }`}
                            >
                              {conceptActiveNormalizedStatus === "DONE"
                                ? "DONE"
                                : conceptActiveNormalizedStatus === "FAILED"
                                  ? "FAILED"
                                  : conceptActiveNormalizedStatus === "QUEUED"
                                    ? "QUEUED"
                                    : conceptActiveNormalizedStatus === "RENDERING"
                                      ? "RENDERING"
                                      : "Pending"}
                            </span>
                            {activeRoom?.selectedRenderMediaId === conceptActiveMediaId.id ? (
                              <button
                                type="button"
                                onClick={handleClearSelected}
                                className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                              >
                                Clear Selected
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={conceptActiveNormalizedStatus !== "DONE"}
                                onClick={() => conceptActiveNormalizedStatus === "DONE" && handleSetSelected(conceptActiveMediaId.id)}
                                title={conceptActiveNormalizedStatus !== "DONE" ? "Available when render is DONE" : undefined}
                                className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-700"
                              >
                                Set Selected
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={updateDisabled || conceptActiveNormalizedStatus !== "DONE"}
                              onClick={() =>
                                !updateDisabled &&
                                conceptActiveNormalizedStatus === "DONE" &&
                                openUpdateModal(conceptActiveMediaId.id)
                              }
                              title={
                                updateDisabled
                                  ? "Max 3 versions per concept."
                                  : conceptActiveNormalizedStatus !== "DONE"
                                    ? "Available when render is DONE"
                                    : undefined
                              }
                              className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-700"
                            >
                              Update
                            </button>
                            {updateDisabled && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400" title="Max 3 versions per concept.">
                                (max 3)
                              </span>
                            )}
                            {conceptActiveMediaId.url && !isBadPlaceholderUrl(conceptActiveMediaId.url) ? (
                              <a
                                href={conceptActiveMediaId.url}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                              >
                                Download
                              </a>
                            ) : (
                              <span
                                className="cursor-not-allowed rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-400 dark:border-zinc-600 dark:text-zinc-500"
                                title="Download available when render has finished"
                              >
                                Download
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteRender(conceptActiveMediaId.id)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                            >
                              Delete
                            </button>
                          </div>
                          {conceptActiveMediaId.renderStatus === "FAILED" && conceptActiveMediaId.renderError && (
                            <p className="truncate px-2 pb-2 text-xs text-red-600 dark:text-red-400" title={conceptActiveMediaId.renderError}>
                              {conceptActiveMediaId.renderError}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Update Render modal */}
              {updateModalRenderId != null && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="update-render-title"
                >
                  <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    <h2 id="update-render-title" className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                      Update Render
                    </h2>
                    <textarea
                      value={updateInstruction}
                      onChange={(e) => setUpdateInstruction(e.target.value)}
                      onKeyDown={handleUpdateModalKeyDown}
                      placeholder="e.g. Leave everything as is but change cabinets to navy blue…"
                      rows={4}
                      className="mb-3 w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      disabled={updateSubmitting}
                    />
                    {updateError && (
                      <p className="mb-2 text-sm text-red-600 dark:text-red-400">{updateError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={closeUpdateModal}
                        disabled={updateSubmitting}
                        className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitUpdate}
                        disabled={updateSubmitting || !canSubmitUpdate()}
                        className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        {updateSubmitting ? "Updating…" : "Update"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-zinc-500">Select a section from the list.</p>
          )}
        </div>
      </section>

      {/* Unassigned Media */}
      {unassigned.length > 0 && (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Unassigned Media
          </h2>
          <p className="mb-3 text-sm text-zinc-500">
            Media not assigned to a section. You can assign it to a section or move it to Front Page Photos.
          </p>
          <div className="space-y-3">
            {unassigned.map((m) => (
              <UnassignedRow
                key={m.id}
                projectId={projectId}
                media={m}
                rooms={rooms}
                onAssign={() => router.refresh()}
                onMoveToFrontPage={() => router.refresh()}
                onDelete={async () => {
                  if (!confirm("Delete this media?")) return;
                  await deleteMediaAction(projectId, m.id);
                  router.refresh();
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ExistingUploadButton({
  projectId,
  roomId,
  onSuccess,
  onError,
  onBatchResult,
}: {
  projectId: string;
  roomId: string;
  onSuccess: () => void;
  onError: (s: string | null) => void;
  onBatchResult?: (result: UploadBatchResult | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    e.target.value = "";
    setUploading(true);
    onError(null);
    onBatchResult?.(null);

    if (files.length === 1) {
      const file = files[0]!;
      try {
        const result = await getPresignedUploadUrlAction(
          projectId,
          file.name,
          file.type || "application/octet-stream"
        );
        if ("error" in result) {
          onError(result.error);
          return;
        }
        const putRes = await fetch(result.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!putRes.ok) {
          onError("Upload failed: " + putRes.statusText);
          return;
        }
        const formData = new FormData();
        formData.set("projectId", projectId);
        formData.set("fileKey", result.fileKey);
        formData.set("url", result.publicUrl);
        formData.set("type", MediaType.EXISTING);
        formData.set("roomId", roomId);
        const res = await createMediaAction(formData);
        if (res.error) onError(res.error);
        else onSuccess();
      } finally {
        setUploading(false);
      }
      return;
    }

    setProgress({ current: 0, total: files.length });
    try {
      const result = await uploadFiles(files, {
        projectId,
        type: MediaType.EXISTING,
        roomId,
        onProgress: (current, total) => setProgress({ current, total }),
      });
      setProgress(null);
      onBatchResult?.(result);
      if (result.successCount > 0) onSuccess();
    } finally {
      setUploading(false);
    }
  }

  const progressLabel =
    progress != null ? `Uploading ${progress.current}/${progress.total}…` : uploading ? "Uploading…" : "Upload Existing";

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={uploading}
        onChange={handleFile}
      />
      {progressLabel}
    </label>
  );
}

function UnassignedRow({
  projectId,
  media,
  rooms,
  onAssign,
  onMoveToFrontPage,
  onDelete,
}: {
  projectId: string;
  media: MediaItem;
  rooms: RoomItem[];
  onAssign: () => void;
  onMoveToFrontPage: () => void;
  onDelete: () => void;
}) {
  const [assignRoomId, setAssignRoomId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [moving, setMoving] = useState(false);

  async function handleAssign() {
    if (!assignRoomId) return;
    setAssigning(true);
    if (assignRoomId === FRONT_PAGE_ID) {
      await updateMediaRoomAction(projectId, media.id, null, "FRONT_PAGE");
    } else {
      await updateMediaRoomAction(projectId, media.id, assignRoomId);
    }
    setAssigning(false);
    onAssign();
  }

  async function handleMoveToFrontPage() {
    setMoving(true);
    await updateMediaRoomAction(projectId, media.id, null, "FRONT_PAGE");
    setMoving(false);
    onMoveToFrontPage();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700">
        {isBadPlaceholderUrl(media.url) ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "#f5f5f5",
              color: "#999",
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              borderRadius: 8,
            }}
          >
            No image
          </div>
        ) : isLegacyBlobUrl(media.url) || !isAllowedHostForNextImage(media.url) ? (
          <img
            src={media.url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Image
            src={media.url}
            alt=""
            fill
            className="object-cover"
            sizes="96px"
            unoptimized={media.url.startsWith("blob:") || !media.url.startsWith("http")}
          />
        )}
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <select
          value={assignRoomId}
          onChange={(e) => setAssignRoomId(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">Assign to…</option>
          <option value={FRONT_PAGE_ID}>Front Page</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAssign}
          disabled={!assignRoomId || assigning}
          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Assign
        </button>
        <button
          type="button"
          onClick={handleMoveToFrontPage}
          disabled={moving}
          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-700"
        >
          {moving ? "Moving…" : "Move to Front Page Photos"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-red-600 hover:underline dark:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
