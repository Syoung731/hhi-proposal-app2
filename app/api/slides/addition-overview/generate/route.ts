/**
 * POST /api/slides/addition-overview/generate
 *
 * Generates a CAD overlay composite for the Addition Overview slide.
 * Takes a source exterior photo and bounding box coordinates, then
 * uses Gemini to add white architectural CAD line drawings showing
 * the proposed addition.
 *
 * Request body:
 *   { sourcePhotoUrl: string, boundingBoxX: number, boundingBoxY: number,
 *     boundingBoxWidth: number, boundingBoxHeight: number,
 *     calloutLabel?: string, overlayIntensity?: number,
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
import { generateAdditionOverlayCad } from "./gemini-addition";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    sourcePhotoUrl,
    boundingBoxX,
    boundingBoxY,
    boundingBoxWidth,
    boundingBoxHeight,
    calloutLabel,
    overlayIntensity,
    projectId,
    slideId,
  } = body as {
    sourcePhotoUrl?: unknown;
    boundingBoxX?: unknown;
    boundingBoxY?: unknown;
    boundingBoxWidth?: unknown;
    boundingBoxHeight?: unknown;
    calloutLabel?: unknown;
    overlayIntensity?: unknown;
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

  const safeBbX = typeof boundingBoxX === "number" ? Math.max(0, Math.min(90, boundingBoxX)) : 10;
  const safeBbY = typeof boundingBoxY === "number" ? Math.max(0, Math.min(90, boundingBoxY)) : 10;
  const safeBbW = typeof boundingBoxWidth === "number" ? Math.max(10, Math.min(90, boundingBoxWidth)) : 40;
  const safeBbH = typeof boundingBoxHeight === "number" ? Math.max(10, Math.min(90, boundingBoxHeight)) : 50;
  const safeLabel = typeof calloutLabel === "string" ? calloutLabel : "Proposed Addition Area";
  const safeIntensity = typeof overlayIntensity === "number" ? Math.max(0, Math.min(100, overlayIntensity)) : 70;

  let imageBytes: Buffer;
  let imageMimeType: string;
  try {
    const result = await generateAdditionOverlayCad({
      sourcePhotoUrl: sourcePhotoUrl.trim(),
      boundingBoxX: safeBbX,
      boundingBoxY: safeBbY,
      boundingBoxWidth: safeBbW,
      boundingBoxHeight: safeBbH,
      calloutLabel: safeLabel,
      overlayIntensity: safeIntensity,
    });
    imageBytes = result.bytes;
    imageMimeType = result.mimeType;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[addition-overview] Gemini error:", msg);
    return NextResponse.json(
      { error: `CAD overlay generation failed: ${msg}`, fallbackToCSS: true },
      { status: 502 }
    );
  }

  const ext =
    imageMimeType === "image/jpeg" || imageMimeType === "image/jpg"
      ? "jpg"
      : imageMimeType === "image/webp"
        ? "webp"
        : "png";

  const timestamp = Date.now();
  const fileKey = `deck-backgrounds/${projectId.trim()}/${slideId.trim()}/addition-cad-${timestamp}.${ext}`;

  let publicUrl: string;
  try {
    const result = await uploadBuffer(fileKey, imageBytes, imageMimeType);
    publicUrl = result.publicUrl;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[addition-overview] R2 upload error:", msg);
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
