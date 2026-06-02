"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  requestBulkPresignedUrls,
  createLocalMediaBatch,
  type CreateLocalMediaBatchItem,
} from "../actions";
import {
  sniffMime,
  pickFinalContentType,
  reorientToJpeg,
  measure,
  uploadWithProgress,
  filterImages,
} from "@/app/lib/media/image-prepare";

// ---------------------------------------------------------------------------
// Constants & tuning
// ---------------------------------------------------------------------------

/** Hard ceiling on a single import (matches BULK_PRESIGN_MAX server-side). */
const MAX_FILES = 100;
/** Concurrent uploads in flight. 5 is a sweet spot for residential uplinks. */
const UPLOAD_CONCURRENCY = 5;
/** Server caps createLocalMediaBatch at 20 — the debounced flusher must
 *  also chunk to this size to stay within the cap. */
const CREATE_BATCH_CHUNK = 20;
/** Debounced create batcher: flush after this many ms of idle. */
const CREATE_FLUSH_INTERVAL_MS = 2000;
/** Or flush early if the buffer reaches this many items. */
const CREATE_FLUSH_THRESHOLD = 10;
/** How long upload workers nap when they find no `ready` files. */
const WORKER_IDLE_NAP_MS = 100;
/** MIME types we accept directly. HEIC also accepted — converted client-side. */
const ACCEPT_ATTR = "image/jpeg,image/png,image/heic,image/heif,image/webp";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-file status as a discriminated union. Each variant carries exactly
 * the data the next stage needs — no orphan fields, no "ready but
 * blob is null" footguns. TS exhaustiveness checks every render branch.
 *
 * Lifecycle:
 *   queued → converting → ready → uploading → done
 *                              ↘            ↘ failed (retryable)
 *                               ↘ failed (retryable from "ready" still has blob)
 *
 *   queued → converting → failed (non-retryable; HEIC decode died)
 */
type FileStatus =
  | { kind: "queued" }
  | { kind: "converting" }
  | {
      kind: "ready";
      blob: Blob;
      contentType: string;
      width: number;
      height: number;
      exifTimestamp: number | null;
    }
  | {
      kind: "uploading";
      progress: number;
      blob: Blob;
      contentType: string;
      width: number;
      height: number;
      exifTimestamp: number | null;
    }
  | {
      kind: "uploaded";
      blob: Blob;
      contentType: string;
      width: number;
      height: number;
      exifTimestamp: number | null;
    }
  | { kind: "done"; mediaId: string }
  | { kind: "failed"; error: string; retryable: boolean };

type ImportItem = {
  /** Stable client-side id. */
  id: string;
  originalFile: File;
  originalName: string;
  /**
   * Pre-determined MIME type the *uploaded* blob will have. Set during
   * sniff+presign; the presigned URL is bound to this type (R2 enforces
   * Content-Type match on PUT), so the conversion stage MUST produce a
   * blob of this type or the PUT fails.
   *
   *   sniffed=heic → "image/jpeg"
   *   sniffed=jpeg → "image/jpeg" (passthrough OR canvas-reorient both yield jpeg)
   *   sniffed=png  → "image/png"  (orientation reorient skipped — see comment below)
   *   sniffed=webp → "image/webp"
   *   sniffed=null → originalFile.type (best-effort)
   */
  finalContentType: string;
  /** Set after presigning (or null if presign hasn't happened / failed). */
  fileKey: string | null;
  publicUrl: string | null;
  uploadUrl: string | null;
  status: FileStatus;
};

/**
 * Entry pushed to the ready queue when conversion finishes. Carries
 * everything an upload worker needs so it doesn't have to fish through
 * React state (which lags behind refs).
 */
type ReadyEntry = {
  itemId: string;
  uploadUrl: string;
  fileKey: string;
  publicUrl: string;
  blob: Blob;
  contentType: string;
  originalName: string;
  width: number;
  height: number;
  exifTimestamp: number | null;
};

type Phase = "picker" | "active" | "complete";

type Props = {
  projectId: string;
  open: boolean;
  onClose: (didImport: boolean) => void;
};

// ---------------------------------------------------------------------------
// Helpers — unchanged from Phase 9
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

/** Sleep helper for worker idle nap. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// sniffMime, pickFinalContentType, reorientToJpeg, measure, and
// uploadWithProgress now live in @/app/lib/media/image-prepare (shared with
// the mobile "Send from Phone" uploader). Imported at the top of this file.

/** Walk a DataTransferItemList and recursively collect File entries. */
async function readEntriesFromDataTransfer(items: DataTransferItemList): Promise<File[]> {
  const out: File[] = [];
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

// filterImages now lives in @/app/lib/media/image-prepare (imported above).

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LocalImportModal({ projectId, open, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("picker");
  const [items, setItems] = useState<ImportItem[]>([]);
  const [batchId, setBatchId] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  /** Set true on Cancel. Loops + workers check this between awaits. */
  const cancelledRef = useRef<boolean>(false);
  /** Live abort handles for in-flight XHRs (so Cancel actually stops them). */
  const inFlightXhrsRef = useRef<Set<() => void>>(new Set());

  /**
   * Files that have finished conversion and are waiting for an upload
   * worker to claim them. Workers `shift()` synchronously — that pop is
   * the atomic claim, so two workers can never grab the same entry.
   */
  const readyQueueRef = useRef<ReadyEntry[]>([]);

  /**
   * Set true when the conversion loop finishes its scan (not when all
   * items are converted — failed items don't appear in readyQueueRef
   * but ARE accounted for here). Workers use this to know "no more
   * ready entries are coming, time to exit if the queue is empty."
   */
  const conversionDoneRef = useRef<boolean>(false);

  /** Live count of upload workers currently running. Used to detect
   *  "all workers exited" so we know the upload phase is done. */
  const activeWorkersRef = useRef<number>(0);

  /**
   * Buffer of successful uploads waiting to be written to the DB via
   * createLocalMediaBatch. Flushed every CREATE_FLUSH_INTERVAL_MS or
   * when CREATE_FLUSH_THRESHOLD items accumulate.
   */
  const createBufferRef = useRef<
    {
      itemId: string;
      payload: CreateLocalMediaBatchItem;
    }[]
  >([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mutex for flush() so we don't double-fire when a timer + threshold race. */
  const flushingRef = useRef<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // Reset everything on (re)open.
  useEffect(() => {
    if (open) {
      cancelledRef.current = false;
      conversionDoneRef.current = false;
      activeWorkersRef.current = 0;
      readyQueueRef.current = [];
      createBufferRef.current = [];
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushingRef.current = false;
      inFlightXhrsRef.current.clear();
      setPhase("picker");
      setItems([]);
      setBatchId(makeBatchId());
    }
  }, [open]);

  // -------------------------------------------------------------------------
  // Picker → Items
  // -------------------------------------------------------------------------

  const ingestFiles = useCallback((rawFiles: File[]) => {
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
      originalName: file.name,
      finalContentType: file.type || "application/octet-stream", // refined during sniff+presign
      fileKey: null,
      publicUrl: null,
      uploadUrl: null,
      status: { kind: "queued" },
    }));
    setItems(next);
    setPhase("active");
  }, []);

  const onPickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    ingestFiles(Array.from(files));
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dt = e.dataTransfer;
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
  // setStatus helper — keeps the status-update incantation tidy.
  // -------------------------------------------------------------------------

  const setStatus = useCallback((itemId: string, status: FileStatus) => {
    setItems((prev) =>
      prev.map((p) => (p.id === itemId ? { ...p, status } : p))
    );
  }, []);

  // -------------------------------------------------------------------------
  // Debounced create-Media batcher
  // -------------------------------------------------------------------------

  /**
   * Flush whatever's in the create buffer to the server. Caller must NOT
   * hold onto the buffer reference across the await; we splice it out
   * synchronously at the top.
   *
   * On per-item failure, marks each as `failed` with retryable=true so
   * the user can rerun via Retry. On whole-batch failure (server error
   * or network), marks every item in the chunk as failed retryable.
   */
  const flush = useCallback(async (): Promise<void> => {
    // Cancel pending timer; we're flushing now.
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (flushingRef.current) return; // mutex — let the in-flight flush finish
    if (createBufferRef.current.length === 0) return;

    flushingRef.current = true;
    try {
      // Drain in chunks of CREATE_BATCH_CHUNK so a single overflowing
      // buffer doesn't violate the server cap.
      while (createBufferRef.current.length > 0) {
        const chunk = createBufferRef.current.splice(0, CREATE_BATCH_CHUNK);
        const payload = chunk.map((c) => c.payload);
        try {
          const res = await createLocalMediaBatch(projectId, batchId, payload);
          if ("error" in res) {
            // Whole-chunk error (auth / project / cap). Mark all retryable.
            for (const c of chunk) {
              setStatus(c.itemId, {
                kind: "failed",
                error: res.error,
                retryable: true,
              });
            }
            continue;
          }
          // Per-row outcome map keyed by fileKey (the payload<->result join key).
          const failedByKey = new Map(
            res.failed.map((f) => [f.fileKey, f.error])
          );
          const successByKey = new Map(
            res.success.map((s) => [s.fileKey, s.id])
          );
          for (const c of chunk) {
            const successId = successByKey.get(c.payload.fileKey);
            if (successId) {
              setStatus(c.itemId, { kind: "done", mediaId: successId });
              continue;
            }
            const errMsg = failedByKey.get(c.payload.fileKey) ?? "Create failed";
            setStatus(c.itemId, {
              kind: "failed",
              error: errMsg,
              retryable: true,
            });
          }
        } catch (e) {
          // Network/runtime error reaching the server action. Mark all in
          // this chunk as retryable — user can rerun and the still-valid
          // R2 objects + presigned URLs let createLocalMediaBatch try
          // again without re-uploading.
          const msg = e instanceof Error ? e.message : "Create call failed";
          for (const c of chunk) {
            setStatus(c.itemId, {
              kind: "failed",
              error: msg,
              retryable: true,
            });
          }
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [projectId, batchId, setStatus]);

  /** Push a successful upload onto the create buffer; flush early if at threshold. */
  const enqueueForCreate = useCallback(
    (entry: ReadyEntry, itemId: string) => {
      const payload: CreateLocalMediaBatchItem = {
        fileKey: entry.fileKey,
        publicUrl: entry.publicUrl,
        contentType: entry.contentType,
        originalName: entry.originalName,
        width: entry.width,
        height: entry.height,
        exifTimestamp: entry.exifTimestamp,
        size: entry.blob.size,
      };
      createBufferRef.current.push({ itemId, payload });
      if (createBufferRef.current.length >= CREATE_FLUSH_THRESHOLD) {
        // Don't await — let the worker keep moving.
        void flush();
      } else if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = null;
          void flush();
        }, CREATE_FLUSH_INTERVAL_MS);
      }
    },
    [flush]
  );

  // -------------------------------------------------------------------------
  // Active phase orchestration
  // -------------------------------------------------------------------------

  // Effect: when entering "active", do sniff+presign+pipeline.
  useEffect(() => {
    if (phase !== "active") return;
    if (items.length === 0) return;

    let cancelled = false;
    cancelledRef.current = false;
    conversionDoneRef.current = false;

    /**
     * Sniff each fresh-queued file's MIME, decide its post-conversion
     * type, and bulk-presign R2 URLs for items that don't already have
     * one. Returns true on success.
     *
     * On retry from "complete" → "active", items that previously
     * succeeded carry their original (still-valid) URLs and are skipped.
     * Items that failed in non-retryable ways (e.g. HEIC decode) are
     * also skipped — their status stays "failed". Only items currently
     * in "queued" status without an uploadUrl get presigned.
     */
    async function sniffAndPresign(): Promise<boolean> {
      const needsPresign = items.filter(
        (it) => !it.uploadUrl && it.status.kind === "queued"
      );
      if (needsPresign.length === 0) return true;

      // Sniff + finalContentType per file (parallel — sniffMime reads only
      // the first 12 bytes, so this is fast even for 100 files).
      const sniffed = await Promise.all(
        needsPresign.map(async (it) => {
          const m = await sniffMime(it.originalFile).catch(() => null);
          return pickFinalContentType(m, it.originalFile.type);
        })
      );

      const presignReq = needsPresign.map((it, i) => ({
        fileName: it.originalName,
        // Note: size is the ORIGINAL size, not post-conversion. R2 doesn't
        // care; the server-side guards count by request length only.
        size: it.originalFile.size,
        contentType: sniffed[i],
      }));

      try {
        const res = await requestBulkPresignedUrls(projectId, presignReq);
        if ("error" in res) {
          for (const it of needsPresign) {
            setStatus(it.id, {
              kind: "failed",
              error: `Presign failed: ${res.error}`,
              retryable: false,
            });
          }
          return false;
        }
        // Patch ONLY the items that needed presigning. Indexed by id, not
        // by position, because needsPresign is a filtered subset of items.
        const byId = new Map(
          needsPresign.map((it, i) => [
            it.id,
            { sniffed: sniffed[i], signed: res.urls[i] },
          ])
        );
        setItems((prev) =>
          prev.map((p) => {
            const patch = byId.get(p.id);
            if (!patch) return p;
            return {
              ...p,
              finalContentType: patch.sniffed,
              fileKey: patch.signed.fileKey,
              publicUrl: patch.signed.publicUrl,
              uploadUrl: patch.signed.uploadUrl,
            };
          })
        );
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Presign call failed";
        for (const it of needsPresign) {
          setStatus(it.id, { kind: "failed", error: msg, retryable: false });
        }
        return false;
      }
    }

    /**
     * Single-thread conversion loop. For each queued item: sniff (again,
     * cheap), HEIC-convert if needed, EXIF-extract, reorient if needed,
     * measure, then push a ReadyEntry to the queue.
     */
    async function conversionLoop(): Promise<void> {
      // Lazy-load both heavy libs so non-import page loads ship 0 KB.
      const exifrMod = await import("exifr");
      const exifrParse: (input: Blob, opts?: unknown) => Promise<unknown> =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exifrMod as any).parse ?? (exifrMod as any).default?.parse;

      // Snapshot ONLY the items currently in queued status. On a fresh
      // active phase that's all of them. On a retry-triggered re-entry
      // it's just the items the user reset — `done` items are excluded
      // so we don't double-process them.
      const toConvert = items.filter((it) => it.status.kind === "queued");
      if (toConvert.length === 0) return;

      // Sniff every file once up-front so we know which ones are HEIC
      // and whether we need heic2any at all.
      const sniffedTypes = await Promise.all(
        toConvert.map(async (it) => sniffMime(it.originalFile).catch(() => null))
      );

      const hasHeic = sniffedTypes.some((s) => s === "image/heic");
      let heic2any:
        | ((opts: {
            blob: Blob;
            toType?: string;
            quality?: number;
          }) => Promise<Blob | Blob[]>)
        | null = null;
      if (hasHeic) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import("heic2any");
        heic2any = mod.default ?? mod;
      }

      for (let i = 0; i < toConvert.length; i++) {
        if (cancelled || cancelledRef.current) return;
        const item = toConvert[i];
        const sniffed = sniffedTypes[i];

        // If presign failed for this item (status is already "failed"),
        // skip it. Re-reading the live items state via the closure doesn't
        // work cleanly here; check the simpler invariant: presign sets
        // uploadUrl on every item or none, so a missing uploadUrl means
        // we should bail.
        // Note: setItems is async, so the item snapshot above may not
        // have the uploadUrl yet. We re-read it from the `prev` arg in a
        // setItems noop trick:
        const live = await new Promise<ImportItem | undefined>((resolve) => {
          setItems((prev) => {
            resolve(prev.find((p) => p.id === item.id));
            return prev;
          });
        });
        if (!live || !live.uploadUrl || !live.fileKey || !live.publicUrl) {
          // Presign failed earlier; skip silently.
          continue;
        }

        setStatus(item.id, { kind: "converting" });

        try {
          let workingBlob: Blob = item.originalFile;
          const finalType = live.finalContentType;

          // Step A: HEIC → JPEG.
          if (sniffed === "image/heic") {
            if (!heic2any) throw new Error("HEIC conversion library failed to load");
            const result = await heic2any({
              blob: item.originalFile,
              toType: "image/jpeg",
              quality: 0.9,
            });
            workingBlob = Array.isArray(result) ? result[0] : result;
          }

          // Step B: EXIF (timestamp + orientation), fail-soft.
          let exifTimestamp: number | null = null;
          let orientation = 1;
          try {
            const exif = (await exifrParse(item.originalFile, {
              tiff: true,
              exif: true,
              ifd0: true,
            })) as
              | { DateTimeOriginal?: Date | string; Orientation?: number }
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
            /* missing EXIF — fall through to lastModified */
          }
          if (exifTimestamp == null) {
            exifTimestamp = item.originalFile.lastModified || null;
          }

          // Step C: bake in orientation. Critical: only safe to reorient
          // when the upload Content-Type can stay JPEG. For PNG/WebP we
          // skip reorient (would change content type post-presign).
          // HEIC was just converted to upright JPEG by heic2any, skip.
          if (
            sniffed !== "image/heic" &&
            finalType === "image/jpeg" &&
            orientation !== 1 &&
            orientation >= 2 &&
            orientation <= 8
          ) {
            workingBlob = await reorientToJpeg(workingBlob, orientation);
          } else if (
            sniffed !== "image/heic" &&
            finalType !== "image/jpeg" &&
            orientation !== 1
          ) {
            // PNG/WebP with non-identity orientation: extremely rare; we
            // log and ship as-is rather than mismatch the presigned type.
            // eslint-disable-next-line no-console
            console.warn(
              `[LocalImport] ${item.originalName} has EXIF orientation ${orientation} but is ${finalType} — skipping reorient to preserve presigned content-type.`
            );
          }

          // Step D: measure.
          const dims = await measure(workingBlob);

          // Mark ready (UI label "Waiting to upload") AND push to the
          // ready queue (workers consume from here).
          const entry: ReadyEntry = {
            itemId: item.id,
            uploadUrl: live.uploadUrl,
            fileKey: live.fileKey,
            publicUrl: live.publicUrl,
            blob: workingBlob,
            contentType: finalType,
            originalName: item.originalName,
            width: dims.width,
            height: dims.height,
            exifTimestamp,
          };
          setStatus(item.id, {
            kind: "ready",
            blob: workingBlob,
            contentType: finalType,
            width: dims.width,
            height: dims.height,
            exifTimestamp,
          });
          readyQueueRef.current.push(entry);
        } catch (e) {
          setStatus(item.id, {
            kind: "failed",
            error: e instanceof Error ? e.message : "Conversion failed",
            retryable: false, // can't retry without re-converting
          });
        }

        // Yield to paint between items (keeps "Converting N of M" honest).
        await Promise.resolve();
      }
    }

    /**
     * Upload worker — runs continuously, atomically claiming entries
     * from readyQueueRef. Exits when the queue is empty AND conversion
     * has finished.
     */
    async function uploadWorker(): Promise<void> {
      activeWorkersRef.current += 1;
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (cancelled || cancelledRef.current) return;

          // Atomic claim: shift() is synchronous + JS is single-threaded,
          // so two workers can't pop the same entry.
          const entry = readyQueueRef.current.shift();
          if (!entry) {
            // Nothing to do. If conversion is finished and queue is empty,
            // exit. Otherwise nap and retry.
            if (conversionDoneRef.current) return;
            await sleep(WORKER_IDLE_NAP_MS);
            continue;
          }

          // Upload. Track progress live; on completion, hand off to the
          // create batcher and keep working.
          setStatus(entry.itemId, {
            kind: "uploading",
            progress: 0,
            blob: entry.blob,
            contentType: entry.contentType,
            width: entry.width,
            height: entry.height,
            exifTimestamp: entry.exifTimestamp,
          });

          const handle = uploadWithProgress(
            entry.uploadUrl,
            entry.blob,
            entry.contentType,
            (pct) => {
              setStatus(entry.itemId, {
                kind: "uploading",
                progress: pct,
                blob: entry.blob,
                contentType: entry.contentType,
                width: entry.width,
                height: entry.height,
                exifTimestamp: entry.exifTimestamp,
              });
            }
          );
          inFlightXhrsRef.current.add(handle.abort);
          try {
            await handle.promise;
            inFlightXhrsRef.current.delete(handle.abort);
            // Status briefly transits "uploaded" so the UI counts include
            // it as done-ish before the create batch lands the mediaId.
            setStatus(entry.itemId, {
              kind: "uploaded",
              blob: entry.blob,
              contentType: entry.contentType,
              width: entry.width,
              height: entry.height,
              exifTimestamp: entry.exifTimestamp,
            });
            enqueueForCreate(entry, entry.itemId);
          } catch (e) {
            inFlightXhrsRef.current.delete(handle.abort);
            setStatus(entry.itemId, {
              kind: "failed",
              error: e instanceof Error ? e.message : "Upload failed",
              retryable: true,
            });
          }
        }
      } finally {
        activeWorkersRef.current -= 1;
      }
    }

    // ----- Orchestrate. -----
    void (async () => {
      const ok = await sniffAndPresign();
      if (cancelled || cancelledRef.current) return;
      if (!ok) {
        // Every item already marked failed; the auto-complete effect
        // will trip on the next render. Done.
        conversionDoneRef.current = true;
        return;
      }

      // Kick off conversion (sequential, single-thread, single instance).
      const conversionPromise = conversionLoop().finally(() => {
        conversionDoneRef.current = true;
      });

      // Kick off N upload workers (all start immediately; they nap when
      // the queue is empty).
      const workerPromises: Promise<void>[] = [];
      for (let i = 0; i < UPLOAD_CONCURRENCY; i++) {
        workerPromises.push(uploadWorker());
      }

      // Wait for everyone, then final-flush the create buffer. The
      // auto-complete effect will see all items terminal and transition
      // phase → complete on the subsequent render.
      await Promise.all([conversionPromise, ...workerPromises]);
      await flush();
    })();

    return () => {
      cancelled = true;
    };
    // We deliberately depend only on `phase` — items are seeded at the
    // same moment we transition, and re-running on every items mutation
    // would double-process every file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // -------------------------------------------------------------------------
  // Auto-complete: when all items are terminal, transition to "complete".
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (phase !== "active") return;
    if (items.length === 0) return;
    const allTerminal = items.every(
      (it) => it.status.kind === "done" || it.status.kind === "failed"
    );
    if (!allTerminal) return;
    // One last buffer flush in case anything is pending. flush() is a
    // no-op when the buffer is empty.
    void flush().then(() => {
      // Re-check after flush — the create call may have flipped some
      // items from "uploaded" → "done"/"failed". If after flush some
      // are still non-terminal (shouldn't happen), don't transition;
      // wait for the next render.
      const stillTerminalAfterFlush = items.every(
        (it) => it.status.kind === "done" || it.status.kind === "failed"
      );
      if (stillTerminalAfterFlush) {
        setPhase("complete");
      }
    });
  }, [items, phase, flush]);

  // -------------------------------------------------------------------------
  // Retry — re-arm failed items + return to active phase.
  // -------------------------------------------------------------------------

  const retryFailed = useCallback(() => {
    // Two retry classes:
    //   1. Failed during conversion (retryable=false): nothing we can do
    //      without re-running the whole prepare pipeline; leave alone.
    //   2. Failed during upload OR create (retryable=true): the presigned
    //      URL is still valid (1hr expiry). Re-set status to "queued" and
    //      bounce through the conversion loop again. For HEIC this
    //      re-converts (wasteful but correct); future improvement: stash
    //      the converted blob so retries skip conversion.
    //
    // Items already `done` are untouched — sniffAndPresign and
    // conversionLoop both filter to queued-only on retry re-entry.
    setItems((prev) =>
      prev.map((p) => {
        if (
          p.status.kind === "failed" &&
          p.status.retryable &&
          p.fileKey &&
          p.publicUrl &&
          p.uploadUrl
        ) {
          return { ...p, status: { kind: "queued" as const } };
        }
        return p;
      })
    );

    // Reset refs for a fresh active-phase run.
    cancelledRef.current = false;
    conversionDoneRef.current = false;
    readyQueueRef.current = [];
    createBufferRef.current = [];
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushingRef.current = false;
    inFlightXhrsRef.current.clear();
    setPhase("active");
  }, []);

  // -------------------------------------------------------------------------
  // Cancel + Close
  // -------------------------------------------------------------------------

  const cancelInFlight = useCallback(() => {
    cancelledRef.current = true;
    for (const abort of inFlightXhrsRef.current) {
      try {
        abort();
      } catch {
        /* swallow */
      }
    }
    inFlightXhrsRef.current.clear();
    // Drop any not-yet-claimed work so workers exit on their next
    // wake-up (they also check cancelledRef).
    readyQueueRef.current = [];
  }, []);

  /**
   * Cancel button: stop everything, flush whatever's been uploaded into
   * the DB, then close the modal. "Keep what's uploaded."
   *
   * Subtle: `items` captured by the closure is stale w.r.t. the post-
   * flush state (the create call may have flipped `uploaded` rows to
   * `done` after we awaited). We read the freshest items via a
   * setItems noop so didImport reflects post-flush truth.
   */
  const handleCancel = useCallback(() => {
    cancelInFlight();
    void flush().finally(() => {
      let didImport = false;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setItems((prev) => {
        didImport = prev.some((it) => it.status.kind === "done");
        return prev; // noop write — only here to read fresh state
      });
      onClose(didImport);
    });
  }, [cancelInFlight, flush, onClose]);

  /**
   * Done button: only enabled when every item is terminal. Always safe
   * to click — no in-flight work to abort.
   */
  const handleDone = useCallback(() => {
    const didImport = items.some((it) => it.status.kind === "done");
    onClose(didImport);
  }, [items, onClose]);

  /** Header X — same semantics as Cancel. */
  const handleHeaderClose = useCallback(() => {
    handleCancel();
  }, [handleCancel]);

  // -------------------------------------------------------------------------
  // Derived counters
  // -------------------------------------------------------------------------

  const counts = useMemo(() => {
    let queued = 0;
    let converting = 0;
    let ready = 0;
    let uploading = 0;
    let uploaded = 0;
    let done = 0;
    let failed = 0;
    for (const it of items) {
      switch (it.status.kind) {
        case "queued":
          queued += 1;
          break;
        case "converting":
          converting += 1;
          break;
        case "ready":
          ready += 1;
          break;
        case "uploading":
          uploading += 1;
          break;
        case "uploaded":
          // "uploaded" is a brief in-flight transit state between the
          // PUT landing and the create-batch flush; treat it as
          // "uploading" for the user-facing breakdown so they see one
          // less thing.
          uploading += 1;
          break;
        case "done":
          done += 1;
          break;
        case "failed":
          failed += 1;
          break;
      }
    }
    const total = items.length;
    const finishedOrFailed = done + failed;
    const allTerminal = total > 0 && finishedOrFailed === total;
    return {
      total,
      queued,
      converting,
      ready,
      uploading,
      uploaded,
      done,
      failed,
      finishedOrFailed,
      allTerminal,
    };
  }, [items]);

  if (!open) return null;

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  /** "12 done · 5 uploading · 3 converting · 18 queued" — skip zero counts. */
  function renderBreakdown(): string {
    const parts: string[] = [];
    if (counts.done > 0) parts.push(`${counts.done} done`);
    if (counts.uploading > 0) parts.push(`${counts.uploading} uploading`);
    if (counts.ready > 0) parts.push(`${counts.ready} waiting to upload`);
    if (counts.converting > 0) parts.push(`${counts.converting} converting`);
    if (counts.queued > 0) parts.push(`${counts.queued} queued`);
    if (counts.failed > 0) parts.push(`${counts.failed} failed`);
    return parts.join(" · ");
  }

  /** Per-row right-side label / progress bar for one item. */
  function renderItemStatus(it: ImportItem) {
    const s = it.status;
    switch (s.kind) {
      case "queued":
        return (
          <span className="block text-right text-[11px] text-zinc-500 dark:text-zinc-400">
            Queued
          </span>
        );
      case "converting":
        return (
          <span className="block text-right text-[11px] text-orange-700 dark:text-orange-300">
            Converting…
          </span>
        );
      case "ready":
        return (
          <span className="block text-right text-[11px] text-zinc-500 dark:text-zinc-400">
            Waiting to upload
          </span>
        );
      case "uploading":
        return (
          <span className="block">
            <span className="block h-1.5 w-full rounded bg-zinc-200 dark:bg-zinc-700">
              <span
                className="block h-1.5 rounded bg-orange-500 transition-[width]"
                style={{ width: `${s.progress}%` }}
              />
            </span>
            <span className="mt-0.5 block text-right text-[10px] text-zinc-500 dark:text-zinc-400">
              Uploading {s.progress}%
            </span>
          </span>
        );
      case "uploaded":
        // Brief transit; show as "Saving…" so it doesn't read like Done
        // until the create batch confirms it.
        return (
          <span className="block text-right text-[11px] text-zinc-500 dark:text-zinc-400">
            Saving…
          </span>
        );
      case "done":
        return (
          <span className="block text-right text-[11px] text-emerald-700 dark:text-emerald-300">
            ✓ Done
          </span>
        );
      case "failed":
        return (
          <span
            className="block truncate text-right text-[11px] text-red-700 dark:text-red-300"
            title={s.error}
          >
            Failed — {s.error}
          </span>
        );
    }
  }

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
            onClick={handleHeaderClose}
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

          {(phase === "active" || phase === "complete") && (
            <div className="flex flex-col gap-3">
              {/* Top status row */}
              <div className="flex items-baseline justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                <div className="flex flex-col">
                  {phase === "active" && (
                    <>
                      <span className="font-medium">
                        Processing {counts.finishedOrFailed} of {counts.total} photo
                        {counts.total === 1 ? "" : "s"}…
                      </span>
                      {renderBreakdown() && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {renderBreakdown()}
                        </span>
                      )}
                    </>
                  )}
                  {phase === "complete" && (
                    <>
                      <span className="font-medium">
                        Imported {counts.done} photo{counts.done === 1 ? "" : "s"}.
                        {counts.failed > 0 ? ` ${counts.failed} failed.` : ""}
                      </span>
                      {renderBreakdown() && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {renderBreakdown()}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Per-file rows */}
              <ul className="flex flex-col gap-1 text-xs">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className={
                      "flex items-center gap-2 rounded border px-2 py-1.5 " +
                      (it.status.kind === "failed"
                        ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30"
                        : it.status.kind === "done"
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
                    <span className="w-44">{renderItemStatus(it)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          {phase === "complete" &&
            items.some(
              (it) => it.status.kind === "failed" && it.status.retryable
            ) && (
              <button
                type="button"
                onClick={retryFailed}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Retry failed (
                {
                  items.filter(
                    (it) => it.status.kind === "failed" && it.status.retryable
                  ).length
                }
                )
              </button>
            )}
          {phase === "active" && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          )}
          {(() => {
            // Done button visibility + disabled state.
            //   picker phase: we still need a Close affordance — show Done
            //     enabled (acts like cancel-with-no-work).
            //   active phase: show disabled "Import in progress…"
            //   complete phase: show enabled "Done"
            if (phase === "picker") {
              return (
                <button
                  type="button"
                  onClick={handleDone}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Close
                </button>
              );
            }
            const allTerminal = counts.allTerminal;
            const disabled = phase === "active" && !allTerminal;
            return (
              <button
                type="button"
                onClick={handleDone}
                disabled={disabled}
                className={
                  "rounded px-3 py-1.5 text-sm font-medium " +
                  (disabled
                    ? "cursor-not-allowed bg-zinc-300 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
                    : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200")
                }
              >
                {disabled ? "Import in progress…" : "Done"}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
