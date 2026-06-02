import { NextResponse } from "next/server";
import {
  verifyPhotoUploadToken,
  PHONE_UPLOAD_MAX_FILES,
} from "@/app/lib/media/photo-upload-token";
import { signBulkUploadUrls } from "@/app/lib/media/upload-pipeline";

/**
 * POST /api/phone-upload/presign
 *
 * Public, token-authenticated. Called by the mobile uploader at /m/<token>.
 * Body: { token: string, files: [{ fileName, contentType, size }] }
 * Returns: { urls: BulkPresignedUrl[] } | { error }
 *
 * Same-origin (the /m page is served from this app), so no CORS needed.
 * The token IS the credential — it scopes the upload to one project.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const rawFiles = Array.isArray(body.files) ? body.files : [];

  const verified = await verifyPhotoUploadToken(token);
  if ("error" in verified) {
    return NextResponse.json({ error: verified.error }, { status: 401 });
  }

  if (rawFiles.length === 0) {
    return NextResponse.json({ urls: [] });
  }
  if (rawFiles.length > PHONE_UPLOAD_MAX_FILES) {
    return NextResponse.json(
      { error: `Too many photos — max ${PHONE_UPLOAD_MAX_FILES} at a time.` },
      { status: 400 },
    );
  }

  const files = rawFiles.map((f: unknown) => {
    const o = (f ?? {}) as Record<string, unknown>;
    return {
      fileName: typeof o.fileName === "string" ? o.fileName : "photo.jpg",
      contentType:
        typeof o.contentType === "string" ? o.contentType : "application/octet-stream",
      size: typeof o.size === "number" ? o.size : 0,
    };
  });

  const res = await signBulkUploadUrls(verified.projectId, files, "phone-upload");
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json(res);
}
