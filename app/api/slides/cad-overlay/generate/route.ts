/**
 * POST /api/slides/cad-overlay/generate
 *
 * Generates a CAD overlay composite image from a source room photo using Gemini
 * (image-in -> image-out). The left portion stays as a realistic photograph while
 * the right transitions into architectural CAD line drawings.
 *
 * Request body:
 *   { sourcePhotoUrl: string, overlayIntensity?: number, transitionPosition?: number,
 *     projectId: string, slideId: string }
 *
 * Response:
 *   { imageUrl: string }
 *
 * Errors:
 *   { error: string, fallbackToCSS?: boolean }
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { uploadBuffer } from "@/app/lib/s3";
import { generateCadOverlay } from "@/app/lib/gemini";

export async function POST(request: Request): Promise<NextResponse> {
  // Auth check
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    sourcePhotoUrl,
    overlayIntensity,
    transitionPosition,
    cadSide,
    projectId,
    slideId,
  } = body as {
    sourcePhotoUrl?: unknown;
    overlayIntensity?: unknown;
    transitionPosition?: unknown;
    cadSide?: unknown;
    projectId?: unknown;
    slideId?: unknown;
  };

  if (typeof sourcePhotoUrl !== "string" || !sourcePhotoUrl.trim()) {
    return NextResponse.json({ error: "sourcePhotoUrl is required" }, { status: 400 });
  }
  if (typeof projectId !== "string" || !projectId.trim()) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  if (typeof slideId !== "string" || !slideId.trim()) {
    return NextResponse.json({ error: "slideId is required" }, { status: 400 });
  }

  const safeIntensity = typeof overlayIntensity === "number"
    ? Math.max(0, Math.min(1, overlayIntensity))
    : 0.7;
  const safePosition = typeof transitionPosition === "number"
    ? Math.max(0, Math.min(100, transitionPosition))
    : 45;

  // Call Gemini CAD overlay generation
  let imageBytes: Buffer;
  let imageMimeType: string;
  try {
    const safeSide: "left" | "right" = cadSide === "left" ? "left" : "right";
    const result = await generateCadOverlay({
      sourcePhotoUrl: sourcePhotoUrl.trim(),
      overlayIntensity: safeIntensity,
      transitionPosition: safePosition,
      cadSide: safeSide,
    });
    imageBytes = result.bytes;
    imageMimeType = result.mimeType;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cad-overlay] Gemini error:", msg);
    // Signal to the client that CSS fallback should be used
    return NextResponse.json(
      { error: `CAD overlay generation failed: ${msg}`, fallbackToCSS: true },
      { status: 502 }
    );
  }

  // Upload to R2
  const ext =
    imageMimeType === "image/jpeg" || imageMimeType === "image/jpg"
      ? "jpg"
      : imageMimeType === "image/webp"
        ? "webp"
        : "png";

  const timestamp = Date.now();
  const fileKey = `deck-backgrounds/${projectId.trim()}/${slideId.trim()}/cad-${timestamp}.${ext}`;

  let publicUrl: string;
  try {
    const result = await uploadBuffer(fileKey, imageBytes, imageMimeType);
    publicUrl = result.publicUrl;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cad-overlay] R2 upload error:", msg);
    return NextResponse.json(
      { error: `Failed to store generated image: ${msg}` },
      { status: 500 }
    );
  }

  if (!publicUrl) {
    return NextResponse.json(
      { error: "Image was stored but no public URL was returned. Check PUBLIC_MEDIA_BASE_URL env var." },
      { status: 500 }
    );
  }

  return NextResponse.json({ imageUrl: publicUrl });
}
