import sharp from "sharp";
import { uploadBuffer } from "@/app/lib/s3";

/**
 * Bulk-import thumbnail spec.
 *
 * Mirrors the decision in BULK_MEDIA_IMPORT_INVESTIGATION.md §7:
 * - 400px wide cap (height auto, preserve aspect)
 * - WebP @ q=80 — small + universally supported by every modern browser
 * - `.rotate()` BEFORE resize so EXIF orientation is baked in to the
 *   pixel buffer; UI doesn't have to deal with orientation tags
 * - never enlarge — `withoutEnlargement` keeps tiny screenshots untouched
 */
const THUMB_WIDTH_PX = 400;
const THUMB_QUALITY = 80;

export type GenerateThumbnailInput = {
  /** Used only for namespacing in logs — does NOT affect the key. */
  projectId: string;
  /** Raw bytes of the original image already uploaded to R2. */
  originalBuffer: Buffer;
  /**
   * R2 key of the original. The thumbnail key is derived from this by
   * inserting `-thumb` before the extension and switching to `.webp`.
   * e.g. `projects/abc/local-import/123-xyz.jpg` →
   *      `projects/abc/local-import/123-xyz-thumb.webp`
   */
  originalFileKey: string;
};

/**
 * Resize an already-uploaded original into a 400px WebP thumbnail and
 * upload it alongside. Returns the thumbnail public URL on success, or
 * `null` if any step fails — callers MUST tolerate null and fall back
 * to the original `url` for display. Never throws.
 *
 * Designed to be safe to await sequentially per-file inside a bulk
 * batch handler — sharp work is CPU-bound and Node will release the
 * event loop between images. If batch latency becomes a concern,
 * caller can `Promise.all` across items; sharp is thread-safe.
 */
export async function generateAndUploadThumbnail({
  projectId,
  originalBuffer,
  originalFileKey,
}: GenerateThumbnailInput): Promise<string | null> {
  try {
    const thumbBuffer = await sharp(originalBuffer)
      .rotate() // bake in EXIF orientation
      .resize(THUMB_WIDTH_PX, null, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();

    const thumbKey = deriveThumbKey(originalFileKey);
    const { publicUrl } = await uploadBuffer(thumbKey, thumbBuffer, "image/webp");
    return publicUrl || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[generate-thumbnail] failed for project=${projectId} key=${originalFileKey} — falling back to full-res`,
      err
    );
    return null;
  }
}

/**
 * Derive `projects/.../foo-thumb.webp` from `projects/.../foo.jpg`.
 * If the original key has no extension, append `-thumb.webp`.
 *
 * Exported for unit testability; not used elsewhere.
 */
export function deriveThumbKey(originalFileKey: string): string {
  const extMatch = originalFileKey.match(/\.[^./]+$/);
  if (extMatch) {
    return originalFileKey.slice(0, extMatch.index) + "-thumb.webp";
  }
  return `${originalFileKey}-thumb.webp`;
}
