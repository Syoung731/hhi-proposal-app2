import { NextResponse } from "next/server";
import {
  verifyPhotoUploadToken,
  recordPhotoUploadActivity,
} from "@/app/lib/media/photo-upload-token";
import {
  commitMediaBatch,
  BULK_CREATE_MAX,
  type CommitMediaItem,
} from "@/app/lib/media/upload-pipeline";

/**
 * POST /api/phone-upload/commit
 *
 * Public, token-authenticated. After the phone PUTs photos to R2 via the
 * presigned URLs, it calls this to create the Media rows. Photos land in the
 * project's Unassigned bucket tagged "phone-upload" for the salesperson to
 * review and assign — never auto-published.
 *
 * Body: { token: string, items: CommitMediaItem[] } (chunk to BULK_CREATE_MAX)
 * Returns: { success, failed } | { error }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const rawItems = Array.isArray(body.items) ? body.items : [];

  const verified = await verifyPhotoUploadToken(token);
  if ("error" in verified) {
    return NextResponse.json({ error: verified.error }, { status: 401 });
  }

  if (rawItems.length === 0) {
    return NextResponse.json({ success: [], failed: [] });
  }
  if (rawItems.length > BULK_CREATE_MAX) {
    return NextResponse.json(
      { error: `Too many items in one batch — max ${BULK_CREATE_MAX}.` },
      { status: 400 },
    );
  }

  const items: CommitMediaItem[] = rawItems.map((it: unknown) => {
    const o = (it ?? {}) as Record<string, unknown>;
    return {
      fileKey: typeof o.fileKey === "string" ? o.fileKey : "",
      publicUrl: typeof o.publicUrl === "string" ? o.publicUrl : "",
      contentType: typeof o.contentType === "string" ? o.contentType : "image/jpeg",
      originalName: typeof o.originalName === "string" ? o.originalName : "photo.jpg",
      width: typeof o.width === "number" ? o.width : 0,
      height: typeof o.height === "number" ? o.height : 0,
      exifTimestamp: typeof o.exifTimestamp === "number" ? o.exifTimestamp : null,
      size: typeof o.size === "number" ? o.size : 0,
    };
  });

  // Reject items missing the storage key (would only ever fail downstream).
  const invalid = items.find((it) => !it.fileKey || !it.publicUrl);
  if (invalid) {
    return NextResponse.json(
      { error: "One or more items are missing a storage key." },
      { status: 400 },
    );
  }

  const result = await commitMediaBatch({
    projectId: verified.projectId,
    items,
    tags: ["phone-upload"],
  });

  await recordPhotoUploadActivity(verified.tokenId, result.success.length);

  return NextResponse.json(result);
}
