"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  filterImages,
  prepareImage,
  uploadWithProgress,
} from "@/app/lib/media/image-prepare";
import type { CommitMediaItem } from "@/app/lib/media/upload-pipeline";
import {
  getStudioReadiness,
  requestStudioPresignedUrls,
  commitStudioRoomPhotos,
  commitStudioHeroPhoto,
  type StudioReadiness,
} from "./actions";

/**
 * Presentation Studio — Phase 1: the "Build Presentation" media wizard.
 *
 * Walks through a hero photo + per-room photos. Photos go straight to R2 via the
 * shared upload pipeline and are assigned to their room (BEFORE/SECTION). Rooms
 * that end up with photos become before/after candidates; rooms without roll up
 * into "Additional Rooms" scope-breakdown slides in the deck.
 */

const CHUNK = 20; // matches BULK_CREATE_MAX

/** Prepare → presign → PUT-to-R2 → commit a set of files for a target. */
async function uploadStudioPhotos(opts: {
  projectId: string;
  roomId: string | null; // null = hero
  files: File[];
  onProgress?: (done: number, total: number) => void;
}): Promise<{ done: number; failed: number }> {
  const images = filterImages(opts.files);
  let done = 0;
  let failed = 0;

  for (let start = 0; start < images.length; start += CHUNK) {
    const chunk = images.slice(start, start + CHUNK);

    const prepared: { file: File; blob: Blob; meta: CommitMediaItem }[] = [];
    for (const file of chunk) {
      try {
        const p = await prepareImage(file);
        prepared.push({
          file,
          blob: p.blob,
          meta: {
            fileKey: "",
            publicUrl: "",
            contentType: p.contentType,
            originalName: file.name,
            width: p.width,
            height: p.height,
            exifTimestamp: p.exifTimestamp,
            size: p.blob.size,
          },
        });
      } catch {
        failed += 1;
      }
    }
    if (!prepared.length) continue;

    const presign = await requestStudioPresignedUrls(
      opts.projectId,
      opts.roomId,
      prepared.map((x) => ({
        fileName: x.file.name,
        contentType: x.meta.contentType,
        size: x.blob.size,
      })),
    );
    if ("error" in presign) {
      failed += prepared.length;
      continue;
    }

    const committable: CommitMediaItem[] = [];
    await Promise.all(
      prepared.map(async (x, i) => {
        const signed = presign.urls[i];
        if (!signed) {
          failed += 1;
          return;
        }
        try {
          await uploadWithProgress(
            signed.uploadUrl,
            x.blob,
            x.meta.contentType,
            () => {},
          ).promise;
          committable.push({
            ...x.meta,
            fileKey: signed.fileKey,
            publicUrl: signed.publicUrl,
          });
        } catch {
          failed += 1;
        }
      }),
    );
    if (!committable.length) continue;

    const res = opts.roomId
      ? await commitStudioRoomPhotos(opts.projectId, opts.roomId, committable)
      : await commitStudioHeroPhoto(opts.projectId, committable);
    if ("error" in res) {
      failed += committable.length;
      continue;
    }
    done += res.success.length;
    failed += res.failed.length;
    opts.onProgress?.(done, images.length);
  }

  return { done, failed };
}

function PhotoTarget({
  projectId,
  roomId,
  title,
  subtitle,
  badge,
  heroUrl,
  onDone,
}: {
  projectId: string;
  roomId: string | null;
  title: string;
  subtitle: string;
  badge?: { text: string; tone: "ready" | "additional" };
  heroUrl?: string | null;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const images = filterImages(Array.from(fileList));
      if (images.length === 0) {
        alert("Please choose image files (JPG, PNG, HEIC, or WebP).");
        return;
      }
      setBusy(true);
      setProgress({ done: 0, total: images.length });
      const res = await uploadStudioPhotos({
        projectId,
        roomId,
        files: images,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setBusy(false);
      setProgress(null);
      onDone();
      if (res.failed > 0) alert(`${res.failed} photo(s) could not be uploaded.`);
    },
    [projectId, roomId, onDone],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
      className={
        "flex items-center gap-4 rounded-lg border p-4 transition-colors " +
        (dragging
          ? "border-[#F47216] bg-orange-50 dark:bg-orange-950/20"
          : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900")
      }
    >
      {heroUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heroUrl}
          alt=""
          className="h-14 w-20 shrink-0 rounded object-cover"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
          {badge && (
            <span
              className={
                "rounded px-1.5 py-0.5 text-xs font-medium " +
                (badge.tone === "ready"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300")
              }
            >
              {badge.text}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {busy && progress
            ? `Uploading ${progress.done} of ${progress.total}…`
            : subtitle}
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={
          "shrink-0 rounded px-3 py-1.5 text-sm font-medium " +
          (busy
            ? "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
            : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200")
        }
      >
        {busy ? "Uploading…" : "Add photos"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}

export function StudioTab({
  projectId,
  rooms,
}: {
  projectId: string;
  rooms: { id: string; name: string }[];
}) {
  const [readiness, setReadiness] = useState<StudioReadiness | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const r = await getStudioReadiness(projectId);
    if (!("error" in r)) setReadiness(r);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const roomList = readiness?.rooms ?? rooms.map((r) => ({
    id: r.id,
    name: r.name,
    photoCount: 0,
    status: "additional" as const,
  }));
  const readyCount = roomList.filter((r) => r.status === "ready").length;
  const additionalCount = roomList.length - readyCount;

  return (
    <div className="py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Intro */}
        <div>
          <span className="inline-block rounded bg-[#F47216]/10 px-2 py-0.5 text-xs font-medium text-[#F47216]">
            Build Presentation · Phase 1
          </span>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Add your photos
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Drop in a hero photo and any photos you have per section. Sections
            with photos become before/after candidates; sections without roll up
            into an <strong>Additional Rooms</strong> summary. You can pull
            photos from your computer, phone, or Drive on the Media tab too.
          </p>
        </div>

        {/* Hero */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Hero photo
          </h3>
          <PhotoTarget
            projectId={projectId}
            roomId={null}
            title="Cover hero"
            subtitle={
              readiness?.hero
                ? "Hero set — drop a new one to replace it."
                : "The main image on the cover slide."
            }
            heroUrl={readiness?.hero?.url ?? null}
            onDone={reload}
          />
        </section>

        {/* Rooms */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Sections {loading ? "" : `(${readyCount} with photos · ${additionalCount} additional)`}
          </h3>
          <div className="space-y-2">
            {roomList.map((r) => (
              <PhotoTarget
                key={r.id}
                projectId={projectId}
                roomId={r.id}
                title={r.name}
                subtitle={
                  r.photoCount > 0
                    ? `${r.photoCount} photo${r.photoCount === 1 ? "" : "s"} added`
                    : "No photos yet — will appear as an Additional Room."
                }
                badge={
                  r.photoCount > 0
                    ? { text: "Before/After ready", tone: "ready" }
                    : { text: "Additional Room", tone: "additional" }
                }
                onDone={reload}
              />
            ))}
            {roomList.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No sections yet — add and price sections first.
              </p>
            )}
          </div>
        </section>

        {/* Build */}
        <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Next: assemble the deck
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Open the deck to generate slides from your sections + photos. Rooms
            with photos get before/after slides (rendering comes in the next
            phase); rooms without are grouped into Additional Rooms.
          </p>
          <Link
            href={`/admin/projects/${projectId}/deck`}
            className="mt-3 inline-block rounded bg-[#F47216] px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Open Presentation Deck →
          </Link>
        </section>
      </div>
    </div>
  );
}
