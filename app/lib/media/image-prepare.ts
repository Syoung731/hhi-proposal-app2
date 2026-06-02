/**
 * Client-side image preparation helpers, shared by the desktop Local Import
 * modal and the mobile "Send from Phone" uploader.
 *
 * These run ONLY in the browser (they use Image, canvas, XMLHttpRequest,
 * and File APIs). Keep them framework-agnostic — no React in here.
 *
 * Invariant that ties this file to the server presign step: the Content-Type
 * we sign a presigned PUT with MUST equal the Content-Type of the blob we
 * actually upload. `pickFinalContentType()` decides that type up front; the
 * conversion in `prepareImage()` is guaranteed to produce a blob of that type.
 */

/**
 * MIME sniff: read the first 12 bytes and identify HEIC/HEIF/JPEG/PNG/WebP.
 * Don't trust the extension — iPhone files copied through Windows Explorer
 * sometimes lose the .heic suffix and arrive as `IMG_4827.JPG` containing
 * HEIC bytes. Rely on the magic number.
 */
export async function sniffMime(file: Blob): Promise<string | null> {
  const slice = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(slice);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
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
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
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
 * Pick the post-conversion MIME type from a sniffed type. MUST match what the
 * upload blob will actually be (R2 enforces Content-Type on PUT).
 */
export function pickFinalContentType(sniffed: string | null, originalType: string): string {
  if (sniffed === "image/heic") return "image/jpeg"; // heic2any always outputs jpeg
  if (sniffed === "image/jpeg") return "image/jpeg";
  if (sniffed === "image/png") return "image/png"; // PNG reorient is skipped
  if (sniffed === "image/webp") return "image/webp";
  return originalType || "application/octet-stream";
}

/**
 * Re-encode an image with rotation baked in via canvas. Modern browsers no
 * longer auto-rotate <img> consistently after the spec change, so we bake it.
 */
export async function reorientToJpeg(blob: Blob, orientation: number): Promise<Blob> {
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
    const swap = orientation >= 5 && orientation <= 8;
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context unavailable");
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
        break;
    }
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
        "image/jpeg",
        0.92,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Measure pixel dimensions of an image blob. */
export async function measure(blob: Blob): Promise<{ width: number; height: number }> {
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
 * because fetch() doesn't expose upload progress.
 */
export function uploadWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
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

/** Filter an arbitrary File[] down to image MIME types (or image extensions). */
export function filterImages(files: File[]): File[] {
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

export type PreparedImage = {
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
  exifTimestamp: number | null;
};

/**
 * Full per-file preparation for the simple (mobile) upload path: sniff →
 * HEIC→JPEG → EXIF (timestamp + orientation) → bake orientation → measure.
 * Returns the upload-ready blob and the metadata the commit step needs.
 *
 * Heavy libs (heic2any, exifr) are dynamically imported so pages that never
 * import a photo ship 0 KB of them.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const sniffed = await sniffMime(file).catch(() => null);
  const finalType = pickFinalContentType(sniffed, file.type);

  let workingBlob: Blob = file;

  // Step A: HEIC → JPEG.
  if (sniffed === "image/heic") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("heic2any");
    const heic2any = mod.default ?? mod;
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    workingBlob = Array.isArray(result) ? result[0] : result;
  }

  // Step B: EXIF (timestamp + orientation), fail-soft.
  let exifTimestamp: number | null = null;
  let orientation = 1;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exifrMod: any = await import("exifr");
    const exifrParse: (input: Blob, opts?: unknown) => Promise<unknown> =
      exifrMod.parse ?? exifrMod.default?.parse;
    const exif = (await exifrParse(file, { tiff: true, exif: true, ifd0: true })) as
      | { DateTimeOriginal?: Date | string; Orientation?: number }
      | undefined;
    if (exif?.DateTimeOriginal) {
      const d =
        exif.DateTimeOriginal instanceof Date
          ? exif.DateTimeOriginal
          : new Date(exif.DateTimeOriginal);
      if (!Number.isNaN(d.getTime())) exifTimestamp = d.getTime();
    }
    if (typeof exif?.Orientation === "number") orientation = exif.Orientation;
  } catch {
    /* missing EXIF — fall through to lastModified */
  }
  if (exifTimestamp == null) exifTimestamp = file.lastModified || null;

  // Step C: bake orientation (only when the upload stays JPEG; HEIC is already
  // upright after heic2any). PNG/WebP reorient is skipped to preserve type.
  if (
    sniffed !== "image/heic" &&
    finalType === "image/jpeg" &&
    orientation >= 2 &&
    orientation <= 8
  ) {
    workingBlob = await reorientToJpeg(workingBlob, orientation);
  }

  // Step D: measure.
  const dims = await measure(workingBlob);

  return {
    blob: workingBlob,
    contentType: finalType,
    width: dims.width,
    height: dims.height,
    exifTimestamp,
  };
}
