import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { getPresignedUploadUrl } from "@/app/lib/s3";

const ALLOWED_TYPES = [
  "image/png",
  "image/svg+xml",
  "image/webp",
] as const;

/** Sanitize filename for use in object key: keep extension, replace unsafe chars. */
function sanitizeFileName(fileName: string): string {
  const base = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (["png", "svg", "webp"].includes(ext)) return base.endsWith(`.${ext}`) ? base : `${base}.${ext}`;
  return base || "logo";
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  let body: { fileName?: string; contentType?: string; variant?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "";
  const variant = body.variant === "light" || body.variant === "dark" ? body.variant : null;

  if (!fileName || !contentType || !variant) {
    return NextResponse.json(
      { error: "fileName, contentType, and variant (light|dark) are required" },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(contentType as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { error: "contentType must be image/png, image/svg+xml, or image/webp" },
      { status: 400 }
    );
  }

  const sanitized = sanitizeFileName(fileName);
  const timestamp = Date.now();
  const fileKey = `settings/branding/${timestamp}-${variant}-${sanitized}`;

  try {
    const { uploadUrl, publicUrl } = await getPresignedUploadUrl(
      fileKey,
      contentType
    );
    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate upload URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
