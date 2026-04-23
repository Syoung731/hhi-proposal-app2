"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  requestBulkPresignedUrls,
  createLocalMediaBatch,
  type CreateLocalMediaBatchItem,
} from "../actions";

// ---------------------------------------------------------------------------
// Constants & tuning
// ---------------------------------------------------------------------------

/** Hard ceiling on a single import (matches BULK_PRESIGN_MAX server-side). */
const MAX_FILES = 100;
/** Concurrent uploads in flight. 5 is a sweet spot for residential uplinks. */
const UPLOAD_CONCURRENCY = 5;
/** Server caps createLocalMediaBatch at 20 — chunk the success list to match. */
const CREATE_BATCH_CHUNK = 20;
/** MIME types we accept directly. HEIC also accepted — converted client-side. */
const ACCEPT_ATTR = "image/jpeg,image/png,image/heic,image/heif,image/webp";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemStatus =
  | "pending" // queued for prepare
  | "preparing" // HEIC convert / EXIF / re-orient in progress
  | "ready" // prepared, waiting for upload slot
  | "uploading" // PUT to R2 in flight
  | "uploaded" // R2 PUT complete, waiting for createLocalMediaBatch
  | "done" // Media row exists
  | "failed";

type ImportItem = {
  /** Stable client-side id (so re-renders don't lose track). */
  id: string;
  /** Original File from the picker. */
  originalFile: File;
  /** What we'll actually upload (post-HEIC-conv / post-re-orient). */
  uploadBlob: Blob | null;
  /** Original filename for the caption. */
  originalName: string;
  /** Final MIME after any conversion. */
  contentType: string;
  width: number;
  height: number;
  /** EXIF DateTimeOriginal as ms epoch — drives sortOrder. */
  exifTimestamp: number | null;
  status: ItemStatus;
  /** 0-100, only meaningful while uploading. */
  progress: number;
  error: string | null;
  /** Set after presigned URL request. */
  fileKey: string | null;
  publicUrl: string | null;
};

type Phase = "picker" | "preparing" | "uploading" | "complete";

type Props = {
  projectId: string;
  open: boolean;
  onClose: (didImport: boolean) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a deterministic-ish batch id. Format: batch-YYYYMMDD-HHmmss. */
function makeBatchId(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    "batch-" +
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** Stable id for a picked file — never collides within one modal session. */
let nextItemId = 0;
function newItemId(): string {
  nextItemId += 1;
  return `f${nextItemId}`;
}

/**
 * MIME sniff: read first 12 bytes and identify HEIC/HEIF/JPEG/PNG/WebP.
 * Don't trust the extension — iPhone files copied through Windows Explorer
 * sometimes lose the .heic suffix and arrive as `IMG_4827.JPG` containing
 * HEIC bytes. Rely on the magic number.
 *
 * Returns canonical MIME or null if unrecognised.
 */
async function sniffMime(file: File): Promise<string | null> {
  const slice = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(slice);
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // HEIC/HEIF: bytes 4..7 == "ftyp" then 8..11 in {heic, heix, hevc, mif1, msf1, heim, heis}
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (
      brand === "heic" ||
      brand === "heix" ||
      brand === "hevc" ||
      brand === "mif1" ||
      brand === "msf1" ||
      brand === "heim" ||
      brand === "heis"
    ) {
      return "image/heic";
    }
  }
  return null;
}

/**
 * Re-encode an image with rotation baked in via canvas. Used for non-HEIC
 * files whose EXIF Orientation is not 1 — modern browsers no longer
 * auto-rotate <img> consistently after the spec change, so we bake it.
 *
 * Returns a JPEG blob @ q=0.92 (matches typical iPhone export quality).
 */
async function reorientToJpeg(blob: Blob, orientation: number): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Image decode failed for re-orient"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    // Orientations 5-8 swap width/height (90/270 degree rotations).
    const swap = orientation >= 5 && orientation <= 8;
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context unavailable");
    // Apply the EXIF orientation transform.
    switch (orientation) {
      case 2:
        ctx.transform(-1, 0, 0, 1, w, 0);
        break;
      case 3:
        ctx.transform(-1, 0, 0, -1, w, h);
        break;
      case 4:
        ctx.transform(1, 0, 0, -1, 0, h);
        break;
      case 5:
        ctx.transform(0, 1, 1, 0, 0, 0);
        break;
      case 6:
        ctx.transform(0, 1, -1, 0, h, 0);
        break;
      case 7:
        ctx.transform(0, -1, -1, 0, h, w);
        break;
      case 8:
        ctx.transform(0, -1, 1, 0, 0, w);
        break;
      default:
        // 1 = identity; never reached here (caller filters)
        break;
    }
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
        "image/jpeg",
        0.92
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Measure pixel dimensions of an image blob. */
async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * PUT a blob to a presigned R2 URL with progress events. Uses XMLHttpRequest
 * because fetch() doesn't expose upload progress. Returns a promise + an
 * abort handle so the modal's Cancel button can stop in-flight requests.
 */
function uploadWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (pct: number) => void
): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`R2 PUT failed: ${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(blob);
  });
  return { promise, abort: () => xhr.abort() };
}

/**
 * Walk a DataTransferItemList and collect all File entries, recursing
 * into directories. Used for the "drag a folder onto the drop zone" flow.
 *
 * Returns a flat list of Files. Caps depth at 8 to defend against
 * pathological symlink loops (filesystem APIs typically don't expose
 * symlinks but belt + suspenders).
 */
async function readEntriesFromDataTransfer(items: DataTransferItemList): Promise<File[]> {
  const out: File[] = [];
  // Snapshot entries up front — DataTransferItemList is live and mutates
  // as we walk it.
  type FsEntry = {
    isFile: boolean;
    isDirectory: boolean;
    file?: (cb: (f: File) => void, errCb: (e: unknown) => void) => void;
    createReader?: () => {
      readEntries: (cb: (entries: FsEntry[]) => void, errCb: (e: unknown) => void) => void;
    };
  };
  const roots: FsEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    const entry = (item as DataTransferItem & {
      webkitGetAsEntry?: () => FsEntry | null;
    }).webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }

  async function walk(entry: FsEntry, depth: number): Promise<void> {
    if (depth > 8) return;
    if (entry.isFile && entry.file) {
      const f = await new Promise<File | null>((resolve) =>
        entry.file!((file) => resolve(file), () => resolve(null))
      );
      if (f) out.push(f);
      return;
    }
    if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      // FileSystemDirectoryReader.readEntries returns a batch at a time;
      // call repeatedly until it returns []. (Chrome batch size = 100.)
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const entries = await new Promise<FsEntry[]>((resolve) =>
          reader.readEntries((es) => resolve(es), () => resolve([]))
        );
        if (entries.length === 0) break;
        for (const child of entries) {
          await walk(child, depth + 1);
        }
      }
    }
  }

  for (const root of roots) {
    await walk(root, 0);
  }
  return out;
}

/** Filter an arbitrary File[] down to image MIME types. */
function filterImages(files: File[]): File[] {
  return files.filter((f) => {
    const t = (f.type || "").toLowerCase();
    if (
      t === "image/jpeg" ||
      t === "image/png" ||
      t === "image/webp" ||
      t === "image/heic" ||
      t === "image/heif"
    ) {
      return true;
    }
    // Some OSes don't fill File.type for HEIC; fall back to extension.
    const name = f.name.toLowerCase();
    return (
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".png") ||
      name.endsWith(".webp") ||
      name.endsWith(".heic") ||
      name.endsWith(".heif")
    );
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LocalImportModal({ projectId, open, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("picker");
  const [items, setItems] = useState<ImportItem[]>([]);
  /** Generated when modal opens; reused across retries. */
  const [batchId, setBatchId] = useState<string>("");
  /** Tracks the visible "Preparing N of M" counter. */
  const [prepareCount, setPrepareCount] = useState<number>(0);
  /** Set true on Cancel. Workers check between awaits and bail. */
  const cancelledRef = useRef<boolean>(false);
  /** Live abort handles for in-flight XHRs (so Cancel actually stops them). */
  const inFlightXhrsRef = useRef<Set<() => void>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  /** True while a drop zone has a drag-over. */
  const [isDragging, setIsDragging] = useState(false);

  // Reset state when the modal opens, so a re-open is a clean slate.
  useEffect(() => {
    if (open) {
      cancelledRef.current = false;
      inFlightXhrsRef.current.clear();
      setPhase("picker");
      setItems([]);
      setBatchId(makeBatchId());
      setPrepareCount(0);
    }
  }, [open]);

  // -------------------------------------------------------------------------
  // Picker → Items
  // -------------------------------------------------------------------------

  const ingestFiles = useCallback(
    (rawFiles: File[]) => {
      const images = filterImages(rawFiles);
      if (images.length === 0) {
        alert("No supported image files found. Accepted: JPG, PNG, HEIC, WebP.");
        return;
      }
      if (images.length > MAX_FILES) {
        alert(
          `That's ${images.length} files — max per import is ${MAX_FILES}. Please trim the selection and try again.`
        );
        return;
      }
      const next: ImportItem[] = images.map((file) => ({
        id: newItemId(),
        originalFile: file,
        uploadBlob: null,
        originalName: file.name,
        contentType: file.type || "application/octet-stream",
        width: 0,
        height: 0,
        exifTimestamp: null,
        status: "pending",
        progress: 0,
        error: null,
        fileKey: null,
        publicUrl: null,
      }));
      setItems(next);
      setPhase("preparing");
    },
    []
  );

  const onPickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    ingestFiles(Array.from(files));
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dt = e.dataTransfer;
    // Prefer the FileSystemEntry path (handles folders); fall back to flat files.
    const supportsEntries =
      dt.items &&
      Array.from(dt.items).some(
        (it) =>
          (it as DataTransferItem & { webkitGetAsEntry?: () => unknown })
            .webkitGetAsEntry !== undefined
      );
    let files: File[];
    if (supportsEntries) {
      files = await readEntriesFromDataTransfer(dt.items);
    } else {
      files = Array.from(dt.files);
    }
    ingestFiles(files);
  };

  // -------------------------------------------------------------------------
  // Preparing → HEIC conv, EXIF, re-orient, measure
  // -------------------------------------------------------------------------

  // Run the prepare loop whenever we enter the preparing phase.
  useEffect(() => {
    if (phase !== "preparing") return;
    if (items.length === 0) return;

    let cancelled = false;
    cancelledRef.current = false;

    async function prepareAll() {
      // Lazy-load both heavy libs so non-import page loads pay 0 KB.
      const exifrMod = await import("exifr");
      // Default export is callable; library shape: parse(file, options).
      const exifrParse: (input: Blob, opts?: unknown) => Promise<unknown> =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exifrMod as any).parse ?? (exifrMod as any).default?.parse;

      // Lazy-load heic2any only if at least one HEIC is present.
      const hasHeic = await Promise.all(
        items.map(async (it) => {
          const sniffed = await sniffMime(it.originalFile);
          return sniffed === "image/heic";
        })
      );
      let heic2any:
        | ((opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>)
        | null = null;
      if (hasHeic.some(Boolean)) {
        // heic2any is browser-only and attaches to window; importing it
        // server-side would crash. We're inside "use client" so we're safe.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import("heic2any");
        heic2any = mod.default ?? mod;
      }

      let done = 0;
      // Process serially. HEIC conversion is CPU-heavy and parallelising
      // would just thrash a single browser thread. Yielding between items
      // (await Promise.resolve()) lets React paint the "Preparing N of M".
      for (let i = 0; i < items.length; i++) {
        if (cancelled || cancelledRef.current) return;
        const item = items[i];
        // Mark this one as preparing in the UI.
        setItems((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: "preparing" } : p))
        );

        try {
          let workingBlob: Blob = item.originalFile;
          let workingType = item.contentType;
          const sniffed = hasHeic[i] ? "image/heic" : await sniffMime(item.originalFile);

          // Step A: HEIC → JPEG.
          if (sniffed === "image/heic") {
            if (!heic2any) throw new Error("HEIC conversion library failed to load");
            const result = await heic2any({
              blob: item.originalFile,
              toType: "image/jpeg",
              quality: 0.9,
            });
            workingBlob = Array.isArray(result) ? result[0] : result;
            workingType = "image/jpeg";
          }

          // Step B: extract EXIF (timestamp + orientation). Fail-soft.
          let exifTimestamp: number | null = null;
          let orientation = 1;
          try {
            const exif = (await exifrParse(item.originalFile, {
              tiff: true,
              exif: true,
              ifd0: true,
            })) as
              | {
                  DateTimeOriginal?: Date | string;
                  Orientation?: number;
                }
              | undefined;
            if (exif?.DateTimeOriginal) {
              const d =
                exif.DateTimeOriginal instanceof Date
                  ? exif.DateTimeOriginal
                  : new Date(exif.DateTimeOriginal);
              if (!Number.isNaN(d.getTime())) {
                exifTimestamp = d.getTime();
              }
            }
            if (typeof exif?.Orientation === "number") {
              orientation = exif.Orientation;
            }
          } catch {
            // EXIF missing / corrupt — fall back to lastModified.
          }
          if (exifTimestamp == null) {
            exifTimestamp = item.originalFile.lastModified || null;
          }

          // Step C: bake in orientation for non-HEIC files. (heic2any
          // already produces an upright JPEG, so skip when we just
          // converted from HEIC.)
          if (sniffed !== "image/heic" && orientation !== 1 && orientation >= 2 && orientation <= 8) {
            workingBlob = await reorientToJpeg(workingBlob, orientation);
            workingType = "image/jpeg";
          }

          // Step D: measure final dimensions.
          const dims = await measure(workingBlob);

          setItems((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? {
                    ...p,
                    uploadBlob: workingBlob,
                    contentType: workingType,
                    width: dims.width,
                    height: dims.height,
                    exifTimestamp,
                    status: "ready",
                  }
                : p
            )
          );
        } catch (e) {
          setItems((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? {
                    ...p,
                    status: "failed",
                    error: e instanceof Error ? e.message : "Prepare failed",
                  }
                : p
            )
          );
        }

        done += 1;
        setPrepareCount(done);
        // Yield to paint.
        await Promise.resolve();
      }

      if (!cancelled && !cancelledRef.current) {
        setPhase("uploading");
      }
    }

    void prepareAll();

    return () => {
      cancelled = true;
    };
    // We deliberately depend only on `phase` — items are seeded at the same
    // moment we transition, and re-running on every items mutation would
    // double-prepare each file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // -------------------------------------------------------------------------
  // Uploading → presign + PUT + createLocalMediaBatch
  // -------------------------------------------------------------------------

  // Run the upload loop whenever we enter the uploading phase.
  useEffect(() => {
    if (phase !== "uploading") return;
    let cancelled = false;
    cancelledRef.current = false;

    async function uploadAll() {
      // Snapshot the items that need uploading (status==="ready" OR
      // status==="failed" if this is a retry from the complete screen,
      // BUT items that previously failed in PREPARE have no uploadBlob —
      // skip those since there's nothing to upload).
      const targets = items.filter((it) => it.status === "ready" && it.uploadBlob);
      if (targets.length === 0) {
        setPhase("complete");
        return;
      }

      // Step 1: presign. Server caps at 100/call — we already validated
      // MAX_FILES at ingest, so a single presign call is safe.
      const presignReq = targets.map((t) => ({
        fileName: t.originalName,
        contentType: t.contentType,
        size: t.uploadBlob!.size,
      }));
      const presignRes = await requestBulkPresignedUrls(projectId, presignReq);
      if ("error" in presignRes) {
        // Mark every target as failed with the same error.
        setItems((prev) =>
          prev.map((p) =>
            targets.find((t) => t.id === p.id)
              ? { ...p, status: "failed", error: presignRes.error }
              : p
          )
        );
        setPhase("complete");
        return;
      }

      // Pair presigned URLs back to items by index — we sent them in target
      // order so position is the join key.
      const pairs = targets.map((t, i) => ({ item: t, signed: presignRes.urls[i] }));

      // Stash fileKey/publicUrl on items immediately so the
      // createLocalMediaBatch step can find them via state.
      setItems((prev) =>
        prev.map((p) => {
          const pair = pairs.find((q) => q.item.id === p.id);
          if (!pair) return p;
          return {
            ...p,
            fileKey: pair.signed.fileKey,
            publicUrl: pair.signed.publicUrl,
          };
        })
      );

      // Step 2: parallel PUTs with bounded concurrency.
      const queue = [...pairs];
      let active = 0;
      const successPairs: typeof pairs = [];

      await new Promise<void>((resolveAll) => {
        const next = () => {
          if (cancelled || cancelledRef.current) {
            if (active === 0) resolveAll();
            return;
          }
          while (active < UPLOAD_CONCURRENCY && queue.length > 0) {
            const pair = queue.shift()!;
            active += 1;

            setItems((prev) =>
              prev.map((p) =>
                p.id === pair.item.id ? { ...p, status: "uploading", progress: 0 } : p
              )
            );

            const handle = uploadWithProgress(
              pair.signed.uploadUrl,
              pair.item.uploadBlob!,
              pair.item.contentType,
              (pct) => {
                setItems((prev) =>
                  prev.map((p) => (p.id === pair.item.id ? { ...p, progress: pct } : p))
                );
              }
            );
            inFlightXhrsRef.current.add(handle.abort);

            handle.promise
              .then(() => {
                inFlightXhrsRef.current.delete(handle.abort);
                setItems((prev) =>
                  prev.map((p) =>
                    p.id === pair.item.id
                      ? { ...p, status: "uploaded", progress: 100, error: null }
                      : p
                  )
                );
                successPairs.push(pair);
              })
              .catch((e: unknown) => {
                inFlightXhrsRef.current.delete(handle.abort);
                setItems((prev) =>
                  prev.map((p) =>
                    p.id === pair.item.id
                      ? {
                          ...p,
                          status: "failed",
                          error: e instanceof Error ? e.message : "Upload failed",
                        }
                      : p
                  )
                );
              })
              .finally(() => {
                active -= 1;
                if (queue.length === 0 && active === 0) {
                  resolveAll();
                } else {
                  next();
                }
              });
          }
        };
        next();
      });

      if (cancelled || cancelledRef.current) {
        setPhase("complete");
        return;
      }

      // Step 3: create Media rows in chunks of CREATE_BATCH_CHUNK.
      // Use the *current* items snapshot so we read fresh fileKey/publicUrl.
      const currentSnapshot = await new Promise<ImportItem[]>((resolve) => {
        setItems((prev) => {
          resolve(prev);
          return prev;
        });
      });
      const uploadedItems = currentSnapshot.filter(
        (it) => it.status === "uploaded" && it.fileKey && it.publicUrl
      );

      for (let i = 0; i < uploadedItems.length; i += CREATE_BATCH_CHUNK) {
        if (cancelled || cancelledRef.current) break;
        const chunk = uploadedItems.slice(i, i + CREATE_BATCH_CHUNK);
        const payload: CreateLocalMediaBatchItem[] = chunk.map((it) => ({
          fileKey: it.fileKey!,
          publicUrl: it.publicUrl!,
          contentType: it.contentType,
          originalName: it.originalName,
          width: it.width,
          height: it.height,
          exifTimestamp: it.exifTimestamp,
          size: it.uploadBlob?.size ?? 0,
        }));
        const res = await createLocalMediaBatch(projectId, batchId, payload);
        if ("error" in res) {
          // Whole-chunk failure — mark all of them.
          setItems((prev) =>
            prev.map((p) =>
              chunk.find((c) => c.id === p.id)
                ? { ...p, status: "failed", error: res.error }
                : p
            )
          );
          continue;
        }
        const failedKeys = new Set(res.failed.map((f) => f.fileKey));
        setItems((prev) =>
          prev.map((p) => {
            const c = chunk.find((cc) => cc.id === p.id);
            if (!c) return p;
            if (failedKeys.has(p.fileKey ?? "")) {
              const errMsg =
                res.failed.find((f) => f.fileKey === p.fileKey)?.error ?? "Create failed";
              return { ...p, status: "failed", error: errMsg };
            }
            return { ...p, status: "done" };
          })
        );
      }

      setPhase("complete");
    }

    void uploadAll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // -------------------------------------------------------------------------
  // Retry (from complete screen)
  // -------------------------------------------------------------------------

  const retryFailed = useCallback(() => {
    // Reset failed items that DO have an uploadBlob back to "ready", clear
    // their error, and re-enter uploading. Items that failed in prepare
    // (no uploadBlob) stay failed — we can't retry without re-running the
    // prepare pipeline, which is fine for v1.
    setItems((prev) =>
      prev.map((p) =>
        p.status === "failed" && p.uploadBlob
          ? {
              ...p,
              status: "ready",
              error: null,
              progress: 0,
              fileKey: null,
              publicUrl: null,
            }
          : p
      )
    );
    setPhase("uploading");
  }, []);

  // -------------------------------------------------------------------------
  // Cancel / Close
  // -------------------------------------------------------------------------

  const cancelInFlight = () => {
    cancelledRef.current = true;
    for (const abort of inFlightXhrsRef.current) {
      try {
        abort();
      } catch {
        /* swallow */
      }
    }
    inFlightXhrsRef.current.clear();
  };

  const handleClose = () => {
    cancelInFlight();
    const didImport = items.some((it) => it.status === "done");
    onClose(didImport);
  };

  // -------------------------------------------------------------------------
  // Derived counters
  // -------------------------------------------------------------------------

  const counts = useMemo(() => {
    const total = items.length;
    let uploaded = 0;
    let done = 0;
    let failed = 0;
    let uploading = 0;
    for (const it of items) {
      if (it.status === "done") done += 1;
      else if (it.status === "failed") failed += 1;
      else if (it.status === "uploaded") uploaded += 1;
      else if (it.status === "uploading") uploading += 1;
    }
    return { total, uploaded, done, failed, uploading };
  }, [items]);

  if (!open) return null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-import-title"
    >
      <div className="flex w-full max-w-2xl flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div>
            <h2
              id="local-import-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Import photos from your computer
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Drop a folder, select files, or pick a folder. Photos land in Unassigned and
              you can assign them to rooms after.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="ml-4 rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body — switches on phase */}
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
          {phase === "picker" && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => void onDrop(e)}
              className={
                "flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-6 py-12 text-center " +
                (isDragging
                  ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30"
                  : "border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/50")
              }
            >
              <p className="text-sm text-zinc-700 dark:text-zinc-200">
                Drag a folder or photos here
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                JPG, PNG, HEIC, WebP — up to {MAX_FILES} files per import
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Select files
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Select folder
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
              {/* webkitdirectory is non-standard; cast through unknown to get past TS DOM typings. */}
              <input
                ref={folderInputRef}
                type="file"
                {...({ webkitdirectory: "" } as unknown as Record<string, string>)}
                multiple
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </div>
          )}

          {(phase === "preparing" || phase === "uploading" || phase === "complete") && (
            <div className="flex flex-col gap-3">
              {/* Top status row */}
              <div className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-200">
                {phase === "preparing" && (
                  <span>
                    Preparing {prepareCount} of {items.length} photo
                    {items.length === 1 ? "" : "s"}…
                  </span>
                )}
                {phase === "uploading" && (
                  <span>
                    Uploaded {counts.uploaded + counts.done} of {counts.total} (
                    {counts.total === 0
                      ? 0
                      : Math.round(((counts.uploaded + counts.done) / counts.total) * 100)}
                    %)
                  </span>
                )}
                {phase === "complete" && (
                  <span>
                    Imported {counts.done} photo{counts.done === 1 ? "" : "s"}.
                    {counts.failed > 0 ? ` ${counts.failed} failed.` : ""}
                  </span>
                )}
                {(phase === "preparing" || phase === "uploading") && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelInFlight();
                      setPhase("complete");
                    }}
                    className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Per-file rows */}
              <ul className="flex flex-col gap-1 text-xs">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className={
                      "flex items-center gap-2 rounded border px-2 py-1.5 " +
                      (it.status === "failed"
                        ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30"
                        : it.status === "done"
                          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                          : "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50")
                    }
                  >
                    <span
                      className="flex-1 truncate text-zinc-700 dark:text-zinc-200"
                      title={it.originalName}
                    >
                      {it.originalName}
                    </span>
                    <span className="w-32">
                      {it.status === "uploading" ? (
                        <span className="block h-1.5 w-full rounded bg-zinc-200 dark:bg-zinc-700">
                          <span
                            className="block h-1.5 rounded bg-orange-500 transition-[width]"
                            style={{ width: `${it.progress}%` }}
                          />
                        </span>
                      ) : (
                        <span
                          className={
                            "block text-right text-[11px] " +
                            (it.status === "failed"
                              ? "text-red-700 dark:text-red-300"
                              : it.status === "done"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-zinc-500 dark:text-zinc-400")
                          }
                        >
                          {it.status === "pending" && "Queued"}
                          {it.status === "preparing" && "Preparing…"}
                          {it.status === "ready" && "Ready"}
                          {it.status === "uploaded" && "Uploaded"}
                          {it.status === "done" && "Done"}
                          {it.status === "failed" && (it.error ?? "Failed")}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          {phase === "complete" && counts.failed > 0 && (
            <button
              type="button"
              onClick={retryFailed}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Retry failed ({counts.failed})
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {phase === "complete" ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
