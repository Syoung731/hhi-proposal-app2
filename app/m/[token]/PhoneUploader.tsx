"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  filterImages,
  prepareImage,
  uploadWithProgress,
} from "@/app/lib/media/image-prepare";

/** Matches PHONE_UPLOAD_MAX_FILES server-side. */
const MAX_FILES = 60;
/** Matches BULK_CREATE_MAX — presign + commit are chunked to this. */
const CHUNK = 20;

type ItemStatus = "pending" | "preparing" | "uploading" | "done" | "failed";
type Item = { id: number; name: string; status: ItemStatus; error?: string };
type Phase = "idle" | "working" | "done";

export function PhoneUploader({
  token,
  projectTitle,
}: {
  token: string;
  projectTitle: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [items, setItems] = useState<Item[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const setStatus = useCallback((id: number, status: ItemStatus, error?: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status, error } : it)));
  }, []);

  const counts = useMemo(() => {
    let done = 0;
    let failed = 0;
    for (const it of items) {
      if (it.status === "done") done += 1;
      else if (it.status === "failed") failed += 1;
    }
    return { total: items.length, done, failed, settled: done + failed };
  }, [items]);

  const process = useCallback(
    async (files: File[]) => {
      // Seed item rows.
      const seeded: Item[] = files.map((f, i) => ({
        id: i,
        name: f.name || `photo-${i + 1}`,
        status: "pending",
      }));
      setItems(seeded);
      setPhase("working");

      for (let start = 0; start < files.length; start += CHUNK) {
        const chunkFiles = files.slice(start, start + CHUNK);
        const chunkIds = chunkFiles.map((_, j) => start + j);

        // 1. Prepare (HEIC convert, EXIF, reorient, measure).
        const prepared: {
          id: number;
          name: string;
          blob: Blob;
          contentType: string;
          width: number;
          height: number;
          exifTimestamp: number | null;
        }[] = [];
        for (let j = 0; j < chunkFiles.length; j++) {
          const id = chunkIds[j];
          setStatus(id, "preparing");
          try {
            const p = await prepareImage(chunkFiles[j]);
            prepared.push({ id, name: chunkFiles[j].name, ...p });
          } catch (e) {
            setStatus(id, "failed", e instanceof Error ? e.message : "Could not read photo");
          }
        }
        if (prepared.length === 0) continue;

        // 2. Presign (order preserved).
        let urls: { uploadUrl: string; fileKey: string; publicUrl: string }[] = [];
        try {
          const res = await fetch("/api/phone-upload/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              files: prepared.map((p) => ({
                fileName: p.name,
                contentType: p.contentType,
                size: p.blob.size,
              })),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Could not start upload");
          urls = data.urls ?? [];
        } catch (e) {
          for (const p of prepared) {
            setStatus(p.id, "failed", e instanceof Error ? e.message : "Upload failed");
          }
          continue;
        }

        // 3. PUT each blob straight to R2.
        const committable: {
          id: number;
          payload: {
            fileKey: string;
            publicUrl: string;
            contentType: string;
            originalName: string;
            width: number;
            height: number;
            exifTimestamp: number | null;
            size: number;
          };
        }[] = [];
        await Promise.all(
          prepared.map(async (p, idx) => {
            const signed = urls[idx];
            if (!signed) {
              setStatus(p.id, "failed", "No upload URL");
              return;
            }
            setStatus(p.id, "uploading");
            try {
              await uploadWithProgress(signed.uploadUrl, p.blob, p.contentType, () => {})
                .promise;
              committable.push({
                id: p.id,
                payload: {
                  fileKey: signed.fileKey,
                  publicUrl: signed.publicUrl,
                  contentType: p.contentType,
                  originalName: p.name,
                  width: p.width,
                  height: p.height,
                  exifTimestamp: p.exifTimestamp,
                  size: p.blob.size,
                },
              });
            } catch (e) {
              setStatus(p.id, "failed", e instanceof Error ? e.message : "Upload failed");
            }
          }),
        );
        if (committable.length === 0) continue;

        // 4. Commit → create Media rows.
        try {
          const res = await fetch("/api/phone-upload/commit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, items: committable.map((c) => c.payload) }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Could not save photos");
          const okKeys = new Set((data.success ?? []).map((s: { fileKey: string }) => s.fileKey));
          for (const c of committable) {
            if (okKeys.has(c.payload.fileKey)) setStatus(c.id, "done");
            else setStatus(c.id, "failed", "Save failed");
          }
        } catch (e) {
          for (const c of committable) {
            setStatus(c.id, "failed", e instanceof Error ? e.message : "Save failed");
          }
        }
      }

      setPhase("done");
    },
    [token, setStatus],
  );

  const onPick = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = filterImages(Array.from(fileList));
    if (files.length === 0) {
      alert("Please choose photos (JPG, PNG, HEIC, or WebP).");
      return;
    }
    if (files.length > MAX_FILES) {
      alert(`That's ${files.length} photos — please select up to ${MAX_FILES} at a time.`);
      return;
    }
    void process(files);
  };

  const pct =
    counts.total > 0 ? Math.round((counts.settled / counts.total) * 100) : 0;

  return (
    <div className="w-full">
      <p className="mb-4 text-center text-sm text-zinc-600">
        Adding photos to <strong>{projectTitle}</strong>.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />

      {phase === "idle" && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl bg-[#F47216] px-4 py-4 text-center text-base font-semibold text-white active:bg-orange-700"
        >
          Select photos
        </button>
      )}

      {phase !== "idle" && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-zinc-800">
                {phase === "done"
                  ? `Uploaded ${counts.done} of ${counts.total}`
                  : `Uploading ${counts.settled} of ${counts.total}…`}
              </span>
              {counts.failed > 0 && (
                <span className="text-red-600">{counts.failed} failed</span>
              )}
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-zinc-200">
              <div
                className="h-2 rounded bg-[#F47216] transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <ul className="flex max-h-[45dvh] flex-col gap-1 overflow-y-auto text-xs">
            {items.map((it) => (
              <li
                key={it.id}
                className={
                  "flex items-center justify-between gap-2 rounded border px-2 py-1.5 " +
                  (it.status === "failed"
                    ? "border-red-200 bg-red-50"
                    : it.status === "done"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-zinc-200 bg-zinc-50")
                }
              >
                <span className="flex-1 truncate text-zinc-700">{it.name}</span>
                <span className="shrink-0 text-zinc-500">
                  {it.status === "done"
                    ? "✓"
                    : it.status === "failed"
                      ? "Failed"
                      : it.status === "uploading"
                        ? "Uploading…"
                        : it.status === "preparing"
                          ? "Preparing…"
                          : "Waiting"}
                </span>
              </li>
            ))}
          </ul>

          {phase === "done" && (
            <button
              type="button"
              onClick={() => {
                setItems([]);
                setPhase("idle");
              }}
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-center text-base font-semibold text-zinc-900 active:bg-zinc-100"
            >
              Add more photos
            </button>
          )}
        </div>
      )}
    </div>
  );
}
