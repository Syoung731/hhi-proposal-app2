"use client";

import { useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  getPresignedUploadUrlAction,
  createMediaAction,
  setHeroAction,
  deleteMediaAction,
  updateMediaRoomAction,
} from "./actions";
import { MediaType } from "@/app/generated/prisma";
import { isBadPlaceholderUrl, isAllowedHostForNextImage } from "@/app/lib/media";

type MediaItem = {
  id: string;
  type: string;
  caption: string | null;
  tags: string[];
  roomId: string | null;
  url: string;
  sortOrder: number;
  room: { id: string; name: string } | null;
};

type RoomItem = {
  id: string;
  name: string;
  sortOrder: number;
  stylePresetId?: string | null;
};

type StylePresetOption = { id: string; name: string };

const ClientMediaGrid = dynamic(() => import("./client-media-grid"), { ssr: false });

type Props = {
  projectId: string;
  media: MediaItem[];
  rooms: RoomItem[];
  projectStylePresetId?: string | null;
  stylePresets?: StylePresetOption[];
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

// Room sections follow Room.sortOrder (source of truth from Rooms tab). No room reorder on Media tab.
export function MediaTab({ projectId, media, rooms, projectStylePresetId = null, stylePresets = [] }: Props) {
  const router = useRouter();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadBatchResult | null>(null);

  const hero = media.find((m) => m.type === MediaType.HERO);
  const roomIds = new Set(rooms.map((r) => r.id));
  const existingByRoom = (roomId: string) =>
    media
      .filter((m) => m.type === MediaType.EXISTING && m.roomId === roomId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const renderingsByRoom = (roomId: string) =>
    media
      .filter((m) => m.type === MediaType.RENDERING && m.roomId === roomId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  // Unassigned: type != HERO and (roomId null or room deleted). When room is deleted, FK SetNull makes roomId null.
  const unassigned = media.filter(
    (m) =>
      m.type !== MediaType.HERO &&
      (m.roomId == null || !roomIds.has(m.roomId))
  );

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
      {/* 1) Front Page – Hero (single image, no room) */}
      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Front Page – Hero
        </h2>
        {hero ? (
          <div className="flex flex-wrap items-start gap-4">
            <div className="relative h-24 w-40 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
              {isBadPlaceholderUrl(hero.url) ? (
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
              ) : isLegacyBlobUrl(hero.url) || !isAllowedHostForNextImage(hero.url) ? (
                <img
                  src={hero.url}
                  alt="Hero"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Image
                  src={hero.url}
                  alt="Hero"
                  fill
                  className="object-cover"
                  sizes="160px"
                  unoptimized={
                    hero.url.startsWith("blob:") || !hero.url.startsWith("http")
                  }
                />
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No hero image yet.</p>
        )}
        <div className="mt-3">
          <HeroUploadButton
            projectId={projectId}
            onSuccess={() => {
              setUploadError(null);
              router.refresh();
            }}
            onError={setUploadError}
          />
        </div>
      </section>

      {/* 2) Existing Photos – grouped by Room (order = Room.sortOrder) */}
      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Existing Photos
        </h2>
        {rooms.map((room) => {
          const items = existingByRoom(room.id);
          return (
            <div key={room.id} className="mb-6 last:mb-0">
              <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {room.name}
              </h3>
              <div className="mb-2">
                <ExistingUploadButton
                  projectId={projectId}
                  roomId={room.id}
                  onSuccess={() => router.refresh()}
                  onError={setUploadError}
                  onBatchResult={setUploadResult}
                />
              </div>
              <ClientMediaGrid
                projectId={projectId}
                roomId={room.id}
                items={items}
                rooms={rooms}
                projectStylePresetId={projectStylePresetId}
                roomStylePresetId={room.stylePresetId ?? null}
                stylePresets={stylePresets}
                onReorderSuccess={() => router.refresh()}
                onDelete={async (id) => {
                  if (!confirm("Delete this media?")) return;
                  await deleteMediaAction(projectId, id);
                  router.refresh();
                }}
                onRenderDone={() => router.refresh()}
              />
              {items.length === 0 && (
                <p className="text-sm text-zinc-500">
                  No Existing Photos yet for {room.name}.
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* 3) Renderings – grouped by Room */}
      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Renderings
        </h2>
        {rooms.map((room) => {
          const items = renderingsByRoom(room.id);
          return (
            <div key={room.id} className="mb-6 last:mb-0">
              <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {room.name}
              </h3>
              <ClientMediaGrid
                projectId={projectId}
                items={items}
                rooms={rooms}
                onReorderSuccess={() => router.refresh()}
                onDelete={async (id) => {
                  if (!confirm("Delete this media?")) return;
                  await deleteMediaAction(projectId, id);
                  router.refresh();
                }}
              />
              {items.length === 0 && (
                <p className="text-sm text-zinc-500">
                  No Renderings yet for {room.name}.
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* 4) Unassigned – only when media exist with type != HERO and (roomId null or deleted room) */}
      {unassigned.length > 0 && (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Unassigned
          </h2>
          <p className="mb-3 text-sm text-zinc-500">
            Media with no room or from a deleted room. Assign to a room to move into Existing Photos or Renderings.
          </p>
          <div className="space-y-3">
            {unassigned.map((m) => (
              <UnassignedRow
                key={m.id}
                projectId={projectId}
                media={m}
                rooms={rooms}
                onAssign={() => router.refresh()}
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

function HeroUploadButton({
  projectId,
  onSuccess,
  onError,
}: {
  projectId: string;
  onSuccess: () => void;
  onError: (s: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    onError(null);
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
      const res = await setHeroAction(projectId, formData);
      if (res.error) onError(res.error);
      else onSuccess();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={uploading}
        onChange={handleFile}
      />
      {uploading ? "Uploading…" : "Upload / Replace Hero"}
    </label>
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
  onDelete,
}: {
  projectId: string;
  media: MediaItem;
  rooms: RoomItem[];
  onAssign: () => void;
  onDelete: () => void;
}) {
  const [assignRoomId, setAssignRoomId] = useState("");
  const [assigning, setAssigning] = useState(false);

  async function handleAssign() {
    if (!assignRoomId) return;
    setAssigning(true);
    await updateMediaRoomAction(projectId, media.id, assignRoomId);
    setAssigning(false);
    onAssign();
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
          <option value="">Assign to room…</option>
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
          onClick={onDelete}
          className="text-xs text-red-600 hover:underline dark:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
