import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/app/lib/prisma";
import { getPresignedUploadUrl, readObjectToBuffer } from "@/app/lib/s3";
import { generateAndUploadThumbnail } from "@/app/lib/media/generate-thumbnail";
import { MediaKind, MediaPlacement, MediaType } from "@/app/generated/prisma";

/**
 * Shared media import pipeline.
 *
 * Single source of truth for the two stages every "import photos" source
 * funnels through:
 *
 *   1. signBulkUploadUrls()  — mint presigned R2 PUT URLs so the bytes go
 *      straight to R2 (never through the Next server / Vercel 4.5MB limit).
 *   2. commitMediaBatch()    — after the client PUTs to R2, read each object
 *      back, generate a thumbnail, and insert the Media row.
 *
 * Callers layer their OWN auth on top:
 *   - Local import (admin):   requireAdmin()  → app/admin/.../media/actions.ts
 *   - Phone/QR upload:        verifyPhotoUploadToken() → /api/phone-upload/*
 *   - Google Drive import:    requireAdmin()  → app/admin/.../media/actions.ts
 *
 * This module performs NO auth itself — never call it from an unauthenticated
 * path without first validating the caller is allowed to write to projectId.
 */

/**
 * Hard ceiling on a single bulk-presign request. Larger imports chunk on the
 * client. 100 keeps payload + per-call latency manageable.
 */
export const BULK_PRESIGN_MAX = 100;

/**
 * Per-call ceiling on commitMediaBatch. Each item triggers a full-res R2 read
 * + sharp resize + R2 thumb write, so 20 keeps wall time per call bounded.
 */
export const BULK_CREATE_MAX = 20;

export type BulkPresignedUrl = {
  /** PUT the file body to this URL with `Content-Type: <contentType>`. */
  uploadUrl: string;
  /** R2 object key (also goes back to commitMediaBatch). */
  fileKey: string;
  /** Public CDN URL — what we save to Media.url after upload completes. */
  publicUrl: string;
  /** Echo of the originally requested filename so client can re-pair URLs to files. */
  originalName: string;
};

export type CommitMediaItem = {
  /** R2 key returned from signBulkUploadUrls. */
  fileKey: string;
  /** Public URL (mirror of fileKey). Saved to Media.url. */
  publicUrl: string;
  /** Final MIME type of what was uploaded to R2 (post-HEIC-conversion). */
  contentType: string;
  /** Original filename (for caption / debug). */
  originalName: string;
  /** Pixel dimensions, measured client-side. */
  width: number;
  height: number;
  /**
   * EXIF DateTimeOriginal as a unix epoch (ms). Drives Media.sortOrder so
   * walkthrough photos render newest-first. `null` → fall back to import order.
   */
  exifTimestamp: number | null;
  /** File size in bytes (post-conversion). Informational only. */
  size: number;
};

export type CommitMediaResult = {
  success: { id: string; fileKey: string }[];
  failed: { fileKey: string; error: string }[];
};

/**
 * Map a client-provided MIME type to a safe filename extension. Centralised so
 * the presign + create paths derive identical extensions. Falls back to `bin`
 * so we never write a `.undefined` key.
 */
export function extFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("heic")) return "heic";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  return "bin";
}

/**
 * Mint one presigned R2 PUT URL per requested file. Returns either an array
 * (success) or `{ error }` (project / size guard failure). Performs NO auth.
 *
 * @param keyPrefix sub-path under projects/<id>/ that namespaces the source,
 *   e.g. "local-import", "phone-upload", "drive-import".
 */
export async function signBulkUploadUrls(
  projectId: string,
  files: { fileName: string; contentType: string; size: number }[],
  keyPrefix: string,
): Promise<{ urls: BulkPresignedUrl[] } | { error: string }> {
  if (!files.length) return { urls: [] };
  if (files.length > BULK_PRESIGN_MAX) {
    return {
      error: `Too many files in one request (${files.length}). Max is ${BULK_PRESIGN_MAX} per call — chunk on the client.`,
    };
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };

  const safePrefix = keyPrefix.replace(/[^a-z0-9_-]/gi, "") || "import";
  const urls: BulkPresignedUrl[] = [];
  for (const file of files) {
    const ext = extFromContentType(file.contentType);
    const fileKey = `projects/${projectId}/${safePrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    try {
      const signed = await getPresignedUploadUrl(fileKey, file.contentType);
      urls.push({
        uploadUrl: signed.uploadUrl,
        fileKey: signed.fileKey,
        publicUrl: signed.publicUrl,
        originalName: file.fileName,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to sign upload URL";
      return { error: message };
    }
  }
  return { urls };
}

/**
 * Create Media rows for a batch of files the client has already uploaded to R2.
 * For each item: read original back from R2, generate a 400px WebP thumbnail
 * (best-effort), then insert a Media row with placement=UNASSIGNED,
 * type=EXISTING, kind=OTHER, roomId=null, and the caller-supplied tags.
 *
 * Per-item failures are isolated (pushed to `failed[]`; loop continues).
 * Performs NO auth — the caller must already have validated write access.
 *
 * sortOrder is derived from EXIF timestamp (seconds) when available so newer
 * walkthrough photos sort to the top; EXIF-less files fall back to a per-batch
 * baseline + index so picker order is preserved.
 */
export async function commitMediaBatch(params: {
  projectId: string;
  items: CommitMediaItem[];
  tags: string[];
}): Promise<CommitMediaResult> {
  const { projectId, items, tags } = params;
  if (!items.length) return { success: [], failed: [] };

  const baseline = await prisma.media
    .aggregate({
      where: {
        projectId,
        type: MediaType.EXISTING,
        roomId: null,
        placement: MediaPlacement.UNASSIGNED,
      },
      _max: { sortOrder: true },
    })
    .then((r) => r._max.sortOrder ?? -1);

  const success: CommitMediaResult["success"] = [];
  const failed: CommitMediaResult["failed"] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let originalBuffer: Buffer;
      try {
        originalBuffer = await readObjectToBuffer(item.fileKey);
      } catch (e) {
        failed.push({
          fileKey: item.fileKey,
          error: `Could not read uploaded file from storage: ${e instanceof Error ? e.message : "unknown"}`,
        });
        continue;
      }

      const thumbnailUrl = await generateAndUploadThumbnail({
        projectId,
        originalBuffer,
        originalFileKey: item.fileKey,
      });

      const sortOrder =
        item.exifTimestamp != null
          ? Math.floor(item.exifTimestamp / 1000)
          : baseline + 1 + i;

      const media = await prisma.media.create({
        data: {
          projectId,
          roomId: null,
          kind: MediaKind.OTHER,
          type: MediaType.EXISTING,
          url: item.publicUrl,
          fileKey: item.fileKey,
          thumbnailUrl,
          caption: item.originalName || null,
          tags,
          sortOrder,
          placement: MediaPlacement.UNASSIGNED,
          width: item.width || null,
          height: item.height || null,
        },
        select: { id: true, fileKey: true },
      });
      success.push({ id: media.id, fileKey: media.fileKey });
    } catch (e) {
      failed.push({
        fileKey: item.fileKey,
        error: e instanceof Error ? e.message : "Unknown error during media create",
      });
    }
  }

  if (success.length > 0) {
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/preview`);
  }
  return { success, failed };
}
