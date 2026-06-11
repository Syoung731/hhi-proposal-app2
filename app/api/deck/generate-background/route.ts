/**
 * POST /api/deck/generate-background
 *
 * Generates an AI background image for a deck slide using Imagen 3 (text-to-image),
 * uploads the result to R2 storage, and returns the public URL.
 *
 * Request body:
 *   { slideType: string, stylePreset: string, projectId: string, slideId: string,
 *     customPrompt?: string }
 *
 * Response:
 *   { imageUrl: string }
 *
 * Errors:
 *   { error: string } with appropriate HTTP status code
 *
 * Notes:
 * - Gemini client + model selection live in app/lib/gemini.ts (generateSlideBackground).
 * - Does NOT set isUserModified — the caller is responsible for bypassing that flag.
 * - Images are stored at deck-backgrounds/{projectId}/{slideId}/{timestamp}.png
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { uploadBuffer } from "@/app/lib/s3";
import { generateSlideBackground } from "@/app/lib/gemini";
import { buildSlideImagePrompt } from "@/app/lib/deck/gemini-slide-prompts";
import type { SlideType } from "@/app/lib/deck/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_SLIDE_TYPES: SlideType[] = [
  "cover",
  "objective",
  "investment-by-space",
  "why-us",
  "scope-overview",
  "before-after",
  "scope-breakdown",
  "our-process",
];

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  // Auth check
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    slideType,
    stylePreset = "",
    projectId,
    slideId,
    customPrompt,
  } = body as {
    slideType?: unknown;
    stylePreset?: unknown;
    projectId?: unknown;
    slideId?: unknown;
    customPrompt?: unknown;
  };

  if (
    typeof slideType !== "string" ||
    !VALID_SLIDE_TYPES.includes(slideType as SlideType)
  ) {
    return NextResponse.json(
      { error: `slideType must be one of: ${VALID_SLIDE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (typeof projectId !== "string" || !projectId.trim()) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  if (typeof slideId !== "string" || !slideId.trim()) {
    return NextResponse.json({ error: "slideId is required" }, { status: 400 });
  }

  const safeStylePreset = typeof stylePreset === "string" ? stylePreset : "";

  // Build prompt — customPrompt (user-edited textarea) takes priority;
  // fall back to the preset-based builder when absent or empty.
  const safeCustomPrompt =
    typeof customPrompt === "string" ? customPrompt.trim() : "";
  const prompt =
    safeCustomPrompt.length > 0
      ? safeCustomPrompt
      : buildSlideImagePrompt(slideType as SlideType, safeStylePreset);

  // Call Gemini via the shared client in app/lib/gemini.ts.
  // Model selection (GEMINI_IMAGE_GEN_MODEL, default "imagen-3.0-generate-002")
  // is handled there — this route owns no model config.
  let imageBytes: Buffer;
  let imageMimeType: string;
  try {
    const result = await generateSlideBackground(prompt);
    imageBytes = result.bytes;
    imageMimeType = result.mimeType;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate-background] Gemini error:", msg);
    return NextResponse.json(
      { error: `Image generation failed: ${msg}` },
      { status: 502 }
    );
  }

  // Determine file extension from MIME type
  const ext =
    imageMimeType === "image/jpeg" || imageMimeType === "image/jpg"
      ? "jpg"
      : imageMimeType === "image/webp"
        ? "webp"
        : "png";

  // Upload to R2
  const timestamp = Date.now();
  const fileKey = `deck-backgrounds/${projectId.trim()}/${slideId.trim()}/${timestamp}.${ext}`;

  let publicUrl: string;
  try {
    const result = await uploadBuffer(fileKey, imageBytes, imageMimeType);
    publicUrl = result.publicUrl;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate-background] R2 upload error:", msg);
    return NextResponse.json(
      { error: `Failed to store generated image: ${msg}` },
      { status: 500 }
    );
  }

  if (!publicUrl) {
    return NextResponse.json(
      {
        error:
          "Image was stored but no public URL was returned. Check PUBLIC_MEDIA_BASE_URL env var.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ imageUrl: publicUrl });
}
