"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { uploadBuffer, deleteR2Objects, readObjectToBuffer } from "@/app/lib/s3";
import { GoogleGenAI } from "@google/genai";
import type { BrandBackground } from "@/app/generated/prisma";
import type { Prisma } from "@/app/generated/prisma";
import sharp from "sharp";
import type { TextZoneSuggestion } from "@/app/lib/deck/types";

import { getGeminiApiKey } from "@/app/integrations/gemini";
import { getGeminiImageModel, getGeminiImageGenModel } from "@/app/lib/ai/gemini-models";

// ─── Generation mode types ────────────────────────────────────────────────────

/**
 * Controls the prompt strategy and intended downstream use of the generated asset.
 *
 * - "subtle-texture"    Low-contrast seamless tile. Composited behind text at ~5–15% opacity.
 * - "blueprint-overlay" Architectural line-work tile. Technical/drafting quality, tiled at low opacity.
 * - "slide-visual"      Full-bleed editorial composition. Brand-aware. Designed to fill one slide.
 */
export type BackgroundGenerationMode = "subtle-texture" | "blueprint-overlay" | "slide-visual";

/**
 * Visual mood preset. Applied when mode is "slide-visual".
 *
 * - "architectural"  Geometric, structured, precision-first. Exposed concrete / steel forms.
 * - "editorial"      High-contrast design-magazine mood. Bold yet refined.
 * - "technical"      Blueprint precision meets luxury brand. Grid-based, engineered-looking.
 * - "warm-luxury"    Organic warmth with premium finish. Linen, stone, warm wood grain.
 */
export type BackgroundStylePreset =
  | "architectural"
  | "editorial"
  | "technical"
  | "warm-luxury";

export type BrandBackgroundActionErrorCode = "NOT_FOUND" | "VALIDATION" | "UNKNOWN";

export type BrandBackgroundActionResult =
  | { ok: true; background: BrandBackground }
  | { ok: false; errorCode: BrandBackgroundActionErrorCode; message: string };

export type BrandBackgroundSimpleResult =
  | { ok: true }
  | { ok: false; errorCode: BrandBackgroundActionErrorCode; message: string };

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildSubtleTexturePrompt(userPrompt: string): string {
  const trimmed = userPrompt.trim() || "Subtle paper-like texture for document background";
  return `Create a seamless, tileable, subtle background texture for professional presentation documents.

Design intent:
- Low contrast, even surface with no strong focal point
- Optimized to sit behind text and graphic content without competing
- Examples of suitable material references: fine paper grain, linen weave, soft concrete, muted noise

User description: ${trimmed}

Technical requirements:
- Output a single square image, at least 1024×1024px, PNG format
- Seamless tiling: left edge must match right edge, top edge must match bottom edge
- No text, no logos, no strong directional gradients, no human figures`;
}

function buildBlueprintOverlayPrompt(userPrompt: string): string {
  const trimmed = userPrompt.trim() || "Light architectural floor plan grid with fine drafting lines";
  return `Create a single square tile for use as a repeating architectural blueprint overlay on a presentation slide background.

Design intent:
- Architectural drafting quality: thin, precise line work only
- Inspired by floor plan fragments, drafting grids, or construction detail callouts
- Watermark quality — this tile will be composited at very low opacity (5–15%) behind presentation content
- Monochromatic: use only pale, cool lines (near-white or very light gray-blue) on a pure white field
- No fills, no shading, no heavy strokes — only fine technical linework
- Must read as deliberate architectural detail, not decorative pattern

User description: ${trimmed}

Technical requirements:
- Output a single square image, at least 1024×1024px, PNG format
- Seamless tiling: left edge must match right edge, top edge must match bottom edge
- No text labels, no color fills, no human figures`;
}

// Per-mode strict behavior following the new concise framework.
// Each string is injected directly into the prompt as a behavior directive.
const SLIDE_MODE_BEHAVIOR: Record<BackgroundStylePreset, string> = {
  architectural:
    "Coastal architectural forms dominate. Lowcountry design language — deep porches, raised foundations, standing-seam metal roofs, tabby walls, board-and-batten siding, exposed rafters. Strong physical depth with warm natural light. Palmetto and live oak framing. Hilton Head Island residential character — not urban, not modern minimalist. No concrete brutalism, no steel frames.",
  editorial:
    "Magazine-quality coastal editorial composition. Bold contrast between warm sunlight and deep shade. Golden hour warmth on natural materials — cypress, cedar, oyster shell tabby, aged brick. Must feel like a Veranda or Coastal Living magazine spread. Warm tones, editorial lighting, Southern luxury feel. Not cold, not urban, not minimalist.",
  technical:
    "Architectural drafting and blueprint linework dominate. Residential floor plans, elevation drawings, and construction details for coastal homes — raised foundations, hurricane-rated framing, porch sections. Lines are crisp and structurally organized. Warm drafting paper tones. Technical but residential in character — not commercial, not industrial.",
  "warm-luxury":
    "Luxury coastal material texture dominates. A single premium surface — honed travertine, warm cypress wood grain, aged tabby shell, handmade ceramic tile, or natural linen — fills the active zone as a macro close-up. Warm golden-hour light raking across the surface. Tones of sand, driftwood, warm white, and sea glass. Refined Lowcountry luxury feel. No cold surfaces, no concrete, no industrial materials.",
};

// Per-seed composition direction (plain language injected into prompt).
const SLIDE_COMPOSITION_DIRECTION: Record<Exclude<SlideCompositionSeed, "split-diptych">, string> = {
  "left-weighted":
    "Visual mass anchored hard to the left 30% of the frame. The remaining right 70% is a clean, uninterrupted, near-uniform field, left open and uninterrupted. Strong left-heavy hierarchy — the right side must contain nothing.",
  "right-weighted":
    "Visual mass anchored hard to the right 30% of the frame. The remaining left 70% is a clean, uninterrupted, near-uniform field, left open and uninterrupted. Strong right-heavy hierarchy — the left side must contain nothing.",
  "bottom-fade":
    "Visual weight grounded at the bottom 25% of the frame, dissolving upward. The upper 75% is a clean, open, near-uniform field for content placement. Bottom-heavy hierarchy only — nothing creeps into the upper zone.",
  corner:
    "Single visual anchor in the lower-left corner only — approximately 20% of the frame. All remaining area is open, clean, and clear and open. The corner element must read as a legible architectural form or material fragment, not a gradient blob.",
};

type SlideCompositionSeed = "left-weighted" | "right-weighted" | "bottom-fade" | "corner" | "split-diptych";

function buildSlideVisualPrompt(
  userPrompt: string,
  stylePreset: BackgroundStylePreset,
  brand: { accentColor: string; textColor: string; companyName: string },
  compositionSeed: SlideCompositionSeed
): string {
  // Split-diptych is a full-frame narrative composition — handled separately.
  if (compositionSeed === "split-diptych") {
    return buildSplitDiptychPrompt(userPrompt, brand);
  }

  const behavior = SLIDE_MODE_BEHAVIOR[stylePreset];
  const direction = SLIDE_COMPOSITION_DIRECTION[compositionSeed];
  const cue = userPrompt.trim()
    || "luxury coastal renovation on Hilton Head Island — Lowcountry architecture, warm natural materials, golden hour light, palmetto and live oak landscaping";

  // Single clean prompt following the BASE COMPOSITION RULE:
  // dominant element → transition → empty text field.
  return `16:9 presentation slide background. Purely visual, no branding. ${behavior} ${direction} The dominant visual element occupies the active zone only; the transition into the empty field is controlled and directional — no radial gradients, no centered glow, no washed-out middle. The empty field is completely clear: no objects, linework, shadows, or texture of any kind. Composition subject (interpret as material and architectural language — not a literal scene): ${cue}. A warm orange accent tone used as a subtle material highlight only. Deep near-black tone anchors structural edge or shadow mass. Negative space is warm off-white or cream. No rooms, environments, or scenes. No people, no logos, no text of any kind, no watermarks, no signage, no written characters. ABSOLUTE RULE: This image must contain ZERO text of any kind. No letters, words, numbers, labels, captions, titles, signs, watermarks, hex codes, annotations, or placeholder text. If any readable character appears anywhere in the image, the entire image is invalid. The image is purely visual — architecture, materials, and light only. Single 16:9 landscape image, 1792×1024px minimum, PNG.`;
}

function buildSplitDiptychPrompt(
  userPrompt: string,
  brand: { accentColor: string; textColor: string; companyName: string }
): string {
  const cue = userPrompt.trim()
    || "architectural blueprint sketch transitioning to a finished Lowcountry luxury home with deep porches, warm materials, and coastal landscaping";

  return `16:9 presentation slide background divided into three horizontal zones. This is a full-frame narrative diptych — high contrast between zones is required and correct.

LEFT ZONE (left 44%): A dense, detailed architectural pencil-sketch or ink-drawing — floor plan, section geometry, elevation, or structural linework drawn on warm ivory drafting paper. Dark graphite lines, cool analytical tone, technical and unresolved. Fill this zone with linework — multiple layers of structure, not a sparse gesture.

CENTER ZONE (middle 12–16%): A dramatic near-black vertical void with irregular, torn or fractured edges where it meets the left and right zones. The darkness peaks at the centerline. The left boundary of the void should look like a ragged tear — organic, energetic. This is the highest-contrast element in the image. Smooth soft gradient edges here are incorrect — the boundary must have graphic force.

RIGHT ZONE (right 44%): ${cue.toLowerCase().includes("home") || cue.toLowerCase().includes("house") || cue.toLowerCase().includes("residen") || cue.toLowerCase().includes("built")
    ? `A photorealistic luxury Lowcountry coastal home — Hilton Head Island style with deep covered porches, standing-seam metal roof, natural cedar or cypress siding, tabby accents, palmetto and live oak landscaping, warm golden-hour light. Southern coastal luxury, not modern minimalist.`
    : `A richly rendered warm luxury material surface — honed travertine, warm wood grain, or premium stone — treated as a photographic close-up with warm directional light. Rich, warm, and detailed.`
  }

TOP 16%: Clear header strip — completely clean, near-uniform, low contrast. No detail, no linework, no edge may enter.

Composition cue: ${cue}. A warm orange accent as subtle highlight in the right zone only. No people, no logos, no text of any kind, no watermarks, no signage, no written characters. ABSOLUTE RULE: This image must contain ZERO text of any kind. No letters, words, numbers, labels, captions, titles, signs, watermarks, hex codes, annotations, or placeholder text. If any readable character appears anywhere in the image, the entire image is invalid. The image is purely visual — architecture, materials, and light only. Single 16:9 landscape image, 1792×1024px minimum, PNG.`;
}

function buildPrompts(
  userPrompt: string,
  mode: BackgroundGenerationMode,
  stylePreset: BackgroundStylePreset,
  brand: { accentColor: string; textColor: string; companyName: string }
): string[] {
  switch (mode) {
    case "subtle-texture":
      return [
        buildSubtleTexturePrompt(userPrompt),
        buildSubtleTexturePrompt(userPrompt),
        buildSubtleTexturePrompt(userPrompt),
      ];
    case "blueprint-overlay":
      return [
        buildBlueprintOverlayPrompt(userPrompt),
        buildBlueprintOverlayPrompt(userPrompt),
      ];
    case "slide-visual":
      // Five parallel calls — four single-zone compositions + one full-frame split diptych.
      return [
        buildSlideVisualPrompt(userPrompt, stylePreset, brand, "left-weighted"),
        buildSlideVisualPrompt(userPrompt, stylePreset, brand, "right-weighted"),
        buildSlideVisualPrompt(userPrompt, stylePreset, brand, "bottom-fade"),
        buildSlideVisualPrompt(userPrompt, stylePreset, brand, "corner"),
        buildSlideVisualPrompt(userPrompt, stylePreset, brand, "split-diptych"),
      ];
  }
}

// ─── Generation input/output types ───────────────────────────────────────────

export type GenerateBackgroundImagesInput = {
  prompt: string;
  mode: BackgroundGenerationMode;
  /** Mood preset — only meaningful for "slide-visual" mode. */
  stylePreset?: BackgroundStylePreset | null;
  /** Brand colors and identity injected into slide-visual prompts. */
  brandContext?: {
    accentColor?: string | null;
    textColor?: string | null;
    companyName?: string | null;
  } | null;
  /**
   * R2 object key for an optional reference image that was pre-uploaded via
   * uploadReferenceImageAction. The action fetches the bytes from R2 itself
   * so no binary data ever crosses the Server Action JSON boundary.
   * The object is deleted from R2 after generation completes (success or error).
   */
  referenceImageKey?: string | null;
  /**
   * MIME type of the reference image (e.g. "image/png", "image/jpeg").
   * Must be provided together with referenceImageKey.
   */
  referenceImageMimeType?: string | null;
  /**
   * Describes which aspect of the reference image should influence generation.
   * - "composition"      — adopt the spatial layout and framing
   * - "style"            — match the overall visual style and treatment
   * - "color-mood"       — draw from the color palette and tonality
   * - "visual-hierarchy" — follow the contrast and emphasis structure
   */
  referenceNote?: "composition" | "style" | "color-mood" | "visual-hierarchy" | null;
};

type GeneratedImage = {
  imageUrl: string;
  imageKey: string;
  compositionSeed?: string | null;
};

export type GenerateBackgroundImagesResult = {
  error?: string;
  images?: GeneratedImage[];
};

/**
 * Upload a reference image to R2 for use with generateBackgroundImagesAction.
 *
 * Accepts a FormData payload with a single "file" field (image/png, image/jpeg,
 * or image/webp, max 4 MB). Returns the R2 key and public URL.
 *
 * Stored under brand-backgrounds/ref-images/ with a random key so they cannot
 * be guessed. generateBackgroundImagesAction deletes the object after use.
 */
export async function uploadReferenceImageAction(
  formData: FormData
): Promise<{ ok: true; key: string; url: string } | { ok: false; error: string }> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file provided." };
  }

  const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "Reference image must be PNG, JPEG, or WebP." };
  }

  const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Reference image must be under 4 MB." };
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const objectKey = `brand-backgrounds/ref-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { publicUrl, fileKey } = await uploadBuffer(objectKey, bytes, file.type);
    return { ok: true, key: fileKey, url: publicUrl };
  } catch (err) {
    console.error("[uploadReferenceImageAction] R2 upload failed:", err);
    return { ok: false, error: "Failed to upload reference image. Please try again." };
  }
}

/**
 * Generate background images via Gemini.
 *
 * - subtle-texture:    3 parallel calls, same seamless-texture prompt
 * - blueprint-overlay: 2 parallel calls, same architectural-line prompt
 * - slide-visual:      2 parallel calls, two distinct composition-seed prompts
 *
 * An optional reference image can be provided via `referenceImageKey` (an R2
 * object key returned by uploadReferenceImageAction). The action fetches the
 * image bytes from R2, passes them to Gemini as inline data, then deletes the
 * temporary object — no binary data ever travels through the SA JSON payload.
 */
export async function generateBackgroundImagesAction(
  input: GenerateBackgroundImagesInput
): Promise<GenerateBackgroundImagesResult> {
  await requireAdmin();

  const geminiKey = await getGeminiApiKey();
  if (!geminiKey?.trim()) {
    return { error: "Gemini API key not configured. Add it in Settings > Integrations." };
  }

  const userPrompt = (input.prompt ?? "").toString().trim();
  const mode = input.mode ?? "subtle-texture";
  const stylePreset = input.stylePreset ?? "architectural";
  const brand = {
    accentColor: input.brandContext?.accentColor?.trim() || "#F47216",
    textColor:   input.brandContext?.textColor?.trim()   || "#1B1B1B",
    companyName: input.brandContext?.companyName?.trim() || "Design-Build Company",
  };

  const prompts = buildPrompts(userPrompt, mode, stylePreset, brand);

  // Build a matching seeds array so each result can be tagged with its composition seed.
  const seeds: (string | null)[] = mode === "slide-visual"
    ? ["left-weighted", "right-weighted", "bottom-fade", "corner", "split-diptych"]
    : prompts.map(() => null);

  // Optional reference image parts prepended to each Gemini message.
  // Image bytes are fetched from R2 here — never sent through the SA payload.
  const refPrefix: unknown[] = [];
  const refKey = input.referenceImageKey?.trim() || null;
  if (refKey && input.referenceImageMimeType?.trim()) {
    try {
      const refBytes = await readObjectToBuffer(refKey);

      let refInstruction: string;
      if (mode === "slide-visual") {
        // For slide-visual, the reference image is compositional guidance only.
        // We need to extract layout logic, contrast structure, and visual tension —
        // NOT recreate the image as a subject or scene.
        const slideNoteMap: Record<string, string> = {
          "composition":
            "Extract the SPATIAL LOGIC of this image — where visual mass and detail sit, " +
            "how the frame is divided, where negative space opens. Apply that compositional weight " +
            "distribution to a 16:9 slide background with a structured text-safe zone. " +
            "Do NOT recreate any specific subject, room, or scene from the reference.",
          "style":
            "Extract the VISUAL LANGUAGE of this image — the material quality, tonal register, " +
            "surface character, and atmospheric treatment. Translate this into abstract architectural " +
            "elements (linework, material texture, structural silhouette) appropriate for a slide " +
            "background. Do NOT copy subject matter or scene composition literally.",
          "color-mood":
            "Extract the COLOR RELATIONSHIPS and tonal mood of this image — palette, temperature, " +
            "light/dark ratio, and the emotional register. Build the slide background's active zone " +
            "and negative space using these tones and contrast logic. Do NOT recreate the scene.",
          "visual-hierarchy":
            "Extract the CONTRAST RHYTHM and visual emphasis of this image — what is heavy vs light, " +
            "active vs passive, dense vs open. Apply that same hierarchy logic to the slide background: " +
            "the dominant zone must be text-safe, and the active zone should carry the visual weight " +
            "in the same proportional way. Do NOT copy subject matter literally.",
        };
        const note = input.referenceNote ?? null;
        const noteInstruction = note
          ? (slideNoteMap[note] ?? slideNoteMap["composition"])
          : "Extract the COMPOSITIONAL STRUCTURE of this image — weight distribution, contrast rhythm, " +
            "and the relationship between active and quiet zones. Apply this logic to a 16:9 slide " +
            "background where the quieter zone serves as a text-safe field. " +
            "Do NOT recreate the subject, room, or scene.";
        refInstruction =
          `[REFERENCE IMAGE — COMPOSITIONAL GUIDANCE ONLY]\n` +
          `This image is a design reference, not a subject to recreate.\n` +
          `${noteInstruction}\n` +
          `The output must remain a SLIDE BACKGROUND with 40–60% low-contrast negative space. ` +
          `Do not let the reference pull the output toward a realistic scene, hero render, or stock photo.`;
      } else {
        // For texture modes, keep the reference guidance generic and lightweight.
        const genericNoteMap: Record<string, string> = {
          "composition":      "spatial layout and framing",
          "style":            "overall visual style and treatment",
          "color-mood":       "color palette and tonality",
          "visual-hierarchy": "contrast and emphasis structure",
        };
        const noteLabel = input.referenceNote
          ? (genericNoteMap[input.referenceNote] ?? "general visual direction")
          : "general visual direction";
        refInstruction = `[Reference image provided. Use it to guide the ${noteLabel} only. Generate a new, original image — do not copy the reference literally.]`;
      }

      refPrefix.push({ text: refInstruction });
      refPrefix.push({
        inlineData: {
          mimeType: input.referenceImageMimeType.trim(),
          data: refBytes.toString("base64"),
        },
      });
    } catch (err) {
      console.warn("[generateBackgroundImagesAction] Could not load reference image from R2; proceeding without it:", err);
    }
  }

  const ai = new GoogleGenAI({ apiKey: geminiKey.trim() });

  const generateOne = async (promptText: string): Promise<{ imageUrl: string; imageKey: string } | null> => {
    let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
    try {
      response = await ai.models.generateContent({
        model: await getGeminiImageModel(),
        contents: [
          {
            role: "user",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            parts: [...refPrefix, { text: promptText }] as any,
          },
        ],
        config: { responseModalities: ["IMAGE"] },
      });
    } catch (e) {
      throw new Error(`Gemini image request failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const candidates = (response as { candidates?: unknown[] })?.candidates;
    const parts = (candidates?.[0] as { content?: { parts?: unknown[] } })?.content?.parts;
    if (!parts?.length) {
      throw new Error("Gemini returned no image content for background generation.");
    }

    let imageBase64: string | undefined;
    let mimeType = "image/png";
    for (const part of parts) {
      const p = part as { inlineData?: { mimeType?: string; data?: string } };
      if (p.inlineData?.data) {
        imageBase64 = p.inlineData.data;
        mimeType = p.inlineData.mimeType ?? "image/png";
        break;
      }
    }

    if (!imageBase64) {
      throw new Error("Gemini returned no inline image data for background generation.");
    }

    const bytes = Buffer.from(imageBase64, "base64");
    const objectKey = `brand-backgrounds/global/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const { publicUrl, fileKey } = await uploadBuffer(objectKey, bytes, mimeType);
    return { imageUrl: publicUrl, imageKey: fileKey };
  };

  // Imagen 4 generator for slide-visual mode — uses generateImages() with a native
  // 16:9 aspect ratio instead of relying on prompt text for dimensions.
  // Reference images (if any) are included as text-only guidance since Imagen 4's
  // generateImages endpoint does not accept inline image data.
  const generateOneImagen4 = async (promptText: string): Promise<{ imageUrl: string; imageKey: string } | null> => {
    // Extract text instruction parts from refPrefix — inlineData cannot be forwarded.
    const refTextParts = (refPrefix as unknown[])
      .filter((p): p is { text: string } => typeof (p as { text?: unknown }).text === "string")
      .map((p) => p.text);
    const fullPrompt = refTextParts.length > 0
      ? `${refTextParts.join("\n\n")}\n\n${promptText}`
      : promptText;

    let imgResponse: Awaited<ReturnType<typeof ai.models.generateImages>>;
    try {
      imgResponse = await ai.models.generateImages({
        model: await getGeminiImageGenModel(),
        prompt: fullPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: { numberOfImages: 1, outputMimeType: "image/png", aspectRatio: "16:9" } as any,
      });
    } catch (e) {
      throw new Error(`Imagen 4 image generation failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const generated = (imgResponse as { generatedImages?: unknown[] })?.generatedImages;
    if (!generated?.length) {
      throw new Error("Imagen 4 returned no generated images.");
    }

    const imageData = (
      generated[0] as { image?: { imageBytes?: string; mimeType?: string } }
    )?.image;
    if (!imageData?.imageBytes) {
      throw new Error(
        "Imagen 4 returned an image record with no imageBytes — the prompt may have been blocked."
      );
    }

    const img4Bytes = Buffer.from(imageData.imageBytes, "base64");
    const img4MimeType = imageData.mimeType ?? "image/png";
    const img4Key = `brand-backgrounds/global/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const { publicUrl: img4Url, fileKey: img4FileKey } = await uploadBuffer(img4Key, img4Bytes, img4MimeType);
    return { imageUrl: img4Url, imageKey: img4FileKey };
  };

  const results: GeneratedImage[] = [];
  const errors: string[] = [];

  const settled = await Promise.all(
    prompts.map((p) =>
      (mode === "slide-visual" ? generateOneImagen4 : generateOne)(p).catch((e) => {
        errors.push(e instanceof Error ? e.message : String(e));
        return null;
      })
    )
  );

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r) results.push({ ...r, compositionSeed: seeds[i] ?? null });
  }

  // Clean up the ephemeral reference image from R2 (success or failure).
  // Fire-and-forget: generation result is not affected if cleanup fails.
  if (refKey) {
    deleteR2Objects([refKey]).catch((err) => {
      console.warn("[generateBackgroundImagesAction] Failed to delete temp reference image:", err);
    });
  }

  if (results.length === 0) {
    return {
      error: errors.length > 0 ? errors.join("; ") : "No background images could be generated.",
    };
  }

  return { images: results };
}

// ---------------------------------------------------------------------------
// BrandBackground CRUD for Settings → Branding → Background Library
// ---------------------------------------------------------------------------

// `isAvailable` controls whether a background can be selected in the app UI.
// `isActive` is an internal toggle for turning backgrounds on/off for global use.
export type BrandBackgroundCreateData = {
  slug: string;
  name: string;
  baseColorHex?: string | null;
  overlayImageUrl?: string | null;
  overlayImageKey?: string | null;
  overlayIconId?: string | null;
  overlayOpacity?: number;
  overlayScale?: number;
  overlaySpacing?: number;
  overlayRotation?: number;
  tags?: string[];
  sortOrder?: number;
  isAvailable?: boolean;
  isActive?: boolean;
  /** Generation mode used to produce the overlay image, if AI-generated. */
  generationMode?: BackgroundGenerationMode | null;
  /** Style preset used during generation. Only meaningful for "slide-visual" mode. */
  stylePreset?: BackgroundStylePreset | null;
  /** Composition seed used when mode is "slide-visual" (e.g. "left-weighted"). */
  compositionSeed?: string | null;
};

export type BrandBackgroundUpdateData = {
  slug?: string;
  name?: string;
  baseColorHex?: string | null;
  overlayImageUrl?: string | null;
  overlayImageKey?: string | null;
  overlayIconId?: string | null;
  overlayOpacity?: number;
  overlayScale?: number;
  overlaySpacing?: number;
  overlayRotation?: number;
  tags?: string[] | null;
  sortOrder?: number;
  isAvailable?: boolean;
  isActive?: boolean;
  generationMode?: BackgroundGenerationMode | null;
  stylePreset?: BackgroundStylePreset | null;
  /** Composition seed used when mode is "slide-visual" (e.g. "left-weighted"). */
  compositionSeed?: string | null;
};

const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 400;

function buildBackgroundPreviewSvg(input: {
  baseColorHex: string | null;
  overlayImageUrl: string | null;
  overlayOpacity: number | null;
  overlayScale: number | null;
  overlaySpacing: number | null;
  overlayRotation: number | null;
}): string {
  const base = input.baseColorHex && HEX_REGEX.test(input.baseColorHex)
    ? input.baseColorHex.toUpperCase()
    : "#FFFFFF";

  const overlayUrl = input.overlayImageUrl ?? null;
  const opacity = input.overlayOpacity ?? 6;
  const scale = input.overlayScale ?? 100;
  const spacing = input.overlaySpacing ?? 120;
  const rotation = input.overlayRotation ?? 0;

  const tileSize = Math.max(
    8,
    Math.round(spacing * ((scale || 100) / 100))
  );

  const hasOverlay = Boolean(overlayUrl);

  const patternDef = hasOverlay
    ? `
    <defs>
      <pattern id="overlayPattern" width="${tileSize}" height="${tileSize}" patternUnits="userSpaceOnUse" patternTransform="rotate(${rotation})">
        <image href="${overlayUrl}" x="0" y="0" width="${tileSize}" height="${tileSize}" preserveAspectRatio="xMidYMid slice" />
      </pattern>
    </defs>
  `
    : "";

  const overlayRect = hasOverlay
    ? `<rect width="100%" height="100%" fill="url(#overlayPattern)" opacity="${Math.max(
        0,
        Math.min(100, opacity)
      ) / 100}"/>`
    : "";

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
    ${patternDef}
    <rect width="100%" height="100%" fill="${base}"/>
    ${overlayRect}
  </svg>
`.trim();
}

async function generateAndStoreBackgroundPreview(
  backgroundId: string
): Promise<BrandBackground | null> {
  const bg = await prisma.brandBackground.findUnique({
    where: { id: backgroundId },
    include: {
      overlayIcon: true,
    },
  });
  if (!bg) return null;

  // For slide-visual mode the overlay is a full-bleed cover image, not a tile.
  // The 9999px spacing convention used on save would make the SVG preview show
  // only a single pixel.  Resize the original generated image directly instead.
  if (bg.generationMode === "slide-visual" && bg.overlayImageKey) {
    try {
      const originalBytes = await readObjectToBuffer(bg.overlayImageKey);
      const resized = await sharp(originalBytes)
        .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT, { fit: "cover" })
        .png()
        .toBuffer();

      const previewKey = `brand-backgrounds/previews/${bg.slug}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.png`;
      const { publicUrl: previewUrl, fileKey: previewFileKey } = await uploadBuffer(
        previewKey,
        resized,
        "image/png"
      );

      const oldPreviewKey = bg.previewImageKey ?? null;
      const updated = await prisma.brandBackground.update({
        where: { id: bg.id },
        data: { previewImageUrl: previewUrl, previewImageKey: previewFileKey },
      });

      if (oldPreviewKey && oldPreviewKey !== previewFileKey) {
        deleteR2Objects([oldPreviewKey]).catch(() => {});
      }

      return updated;
    } catch {
      // Fall through to the SVG path if the original image can't be fetched or resized.
    }
  }

  // Resolve the overlay image.
  // Prefer the explicit overlay image; fall back to the icon PNG.
  // Fetch via R2 key so we can embed as a base64 data URI — librsvg (used by
  // Sharp) cannot load remote HTTP URLs during server-side SVG rendering.
  const overlayKey =
    bg.overlayImageKey ??
    (bg.overlayIcon?.imageKey ?? null);

  let overlayDataUri: string | null = null;
  if (overlayKey) {
    try {
      const buf = await readObjectToBuffer(overlayKey);
      overlayDataUri = `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      // Key missing or unreadable — fall back to the public URL as a last
      // resort (may not render in all environments, but better than nothing).
      overlayDataUri =
        bg.overlayImageUrl ??
        (bg.overlayIcon?.imageUrl ?? null);
    }
  }

  const svg = buildBackgroundPreviewSvg({
    baseColorHex: bg.baseColorHex,
    overlayImageUrl: overlayDataUri,
    overlayOpacity: bg.overlayOpacity,
    overlayScale: bg.overlayScale,
    overlaySpacing: bg.overlaySpacing,
    overlayRotation: bg.overlayRotation,
  });

  let png: Buffer;
  try {
    png = await sharp(Buffer.from(svg)).png().toBuffer();
  } catch {
    return null;
  }

  const objectKey = `brand-backgrounds/previews/${bg.slug}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.png`;

  let publicUrl: string | null = null;
  let fileKey: string | null = null;
  try {
    const uploaded = await uploadBuffer(objectKey, png, "image/png");
    publicUrl = uploaded.publicUrl;
    fileKey = uploaded.fileKey;
  } catch {
    return null;
  }

  if (!publicUrl || !fileKey) return null;

  const oldKey = bg.previewImageKey ?? null;

  const updated = await prisma.brandBackground.update({
    where: { id: bg.id },
    data: {
      previewImageUrl: publicUrl,
      previewImageKey: fileKey,
    },
  });

  if (oldKey && oldKey !== fileKey) {
    try {
      await deleteR2Objects([oldKey]);
    } catch {
      // Ignore preview cleanup failures
    }
  }

  return updated;
}

const HEX_REGEX = /^#([0-9a-fA-F]{6})$/;
const SLUG_REGEX = /^[a-z0-9-]{2,60}$/;

function normalizeSlug(raw: string): string {
  const trimmed = (raw ?? "").toString().trim().toLowerCase();
  if (!trimmed) return "";
  const kebab = trimmed
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return kebab;
}

function validateSlug(slug: string): { error?: string } {
  if (!slug) return { error: "Slug is required" };
  if (!SLUG_REGEX.test(slug)) {
    return {
      error: "Slug must be 2–60 characters and use only lowercase letters, numbers, and dashes",
    };
  }
  return {};
}

function normalizeTags(tags: string[] | null | undefined): string[] {
  if (!tags) return [];
  const normalized = tags
    .flatMap((t) => (Array.isArray(t) ? t : [t]))
    .map((t) => (t ?? "").toString().trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function validateAndNormalizeBackgroundInput(
  input: BrandBackgroundCreateData | BrandBackgroundUpdateData,
  existing?: BrandBackground
): { error?: string; data?: BrandBackgroundCreateData | BrandBackgroundUpdateData } {
  const out: BrandBackgroundCreateData | BrandBackgroundUpdateData = {};

  // Name
  if ("name" in input) {
    const nameRaw =
      input.name !== undefined ? input.name : existing ? existing.name : "";
    const name = (nameRaw ?? "").toString().trim();
    if (!name) return { error: "Name is required" };
    (out as BrandBackgroundUpdateData).name = name;
  }

  // Slug
  if ("slug" in input) {
    const raw = input.slug ?? existing?.slug ?? "";
    const slug = normalizeSlug(raw);
    const slugValidation = validateSlug(slug);
    if (slugValidation.error) return slugValidation;
    (out as BrandBackgroundUpdateData).slug = slug;
  }

  // baseColorHex (optional)
  if ("baseColorHex" in input) {
    const raw = input.baseColorHex ?? existing?.baseColorHex ?? null;
    if (raw == null || raw === "") {
      (out as BrandBackgroundUpdateData).baseColorHex = null;
    } else {
      const trimmed = (raw ?? "").toString().trim();
      if (!HEX_REGEX.test(trimmed)) {
        return { error: "Base color must be a hex color like #FFFFFF" };
      }
      (out as BrandBackgroundUpdateData).baseColorHex = trimmed.toUpperCase();
    }
  }

  // Overlay numbers
  if ("overlayOpacity" in input) {
    if (input.overlayOpacity == null) {
      (out as BrandBackgroundUpdateData).overlayOpacity = undefined;
    } else {
      const v = clamp(Number(input.overlayOpacity), 0, 100);
      (out as BrandBackgroundUpdateData).overlayOpacity = v;
    }
  }
  if ("overlayScale" in input) {
    if (input.overlayScale == null) {
      (out as BrandBackgroundUpdateData).overlayScale = undefined;
    } else {
      const v = clamp(Number(input.overlayScale), 25, 300);
      (out as BrandBackgroundUpdateData).overlayScale = v;
    }
  }
  if ("overlaySpacing" in input) {
    if (input.overlaySpacing == null) {
      (out as BrandBackgroundUpdateData).overlaySpacing = undefined;
    } else {
      const v = clamp(Number(input.overlaySpacing), 10, 600);
      (out as BrandBackgroundUpdateData).overlaySpacing = v;
    }
  }
  if ("overlayRotation" in input) {
    if (input.overlayRotation == null) {
      (out as BrandBackgroundUpdateData).overlayRotation = undefined;
    } else {
      const v = clamp(Number(input.overlayRotation), 0, 45);
      (out as BrandBackgroundUpdateData).overlayRotation = v;
    }
  }

  // Overlay references
  if ("overlayImageUrl" in input) {
    const urlRaw =
      input.overlayImageUrl ?? existing?.overlayImageUrl ?? null;
    (out as BrandBackgroundUpdateData).overlayImageUrl =
      urlRaw && urlRaw.trim().length > 0 ? urlRaw.trim() : null;
  }
  if ("overlayImageKey" in input) {
    const keyRaw =
      input.overlayImageKey ?? existing?.overlayImageKey ?? null;
    (out as BrandBackgroundUpdateData).overlayImageKey =
      keyRaw && keyRaw.trim().length > 0 ? keyRaw.trim() : null;
  }
  if ("overlayIconId" in input) {
    const iconIdRaw =
      input.overlayIconId ?? existing?.overlayIconId ?? null;
    (out as BrandBackgroundUpdateData).overlayIconId =
      iconIdRaw && iconIdRaw.trim().length > 0 ? iconIdRaw.trim() : null;
  }

  if ("tags" in input) {
    (out as BrandBackgroundUpdateData).tags = input.tags
      ? normalizeTags(input.tags)
      : [];
  }

  if ("isAvailable" in input && input.isAvailable !== undefined) {
    (out as BrandBackgroundUpdateData).isAvailable = Boolean(
      input.isAvailable
    );
  }

  if ("isActive" in input && input.isActive !== undefined) {
    (out as BrandBackgroundUpdateData).isActive = Boolean(input.isActive);
  }

  if ("sortOrder" in input && input.sortOrder !== undefined) {
    (out as BrandBackgroundUpdateData).sortOrder = Number(input.sortOrder);
  }

  // Generation provenance
  const VALID_MODES: BackgroundGenerationMode[] = ["subtle-texture", "blueprint-overlay", "slide-visual"];
  const VALID_PRESETS: BackgroundStylePreset[] = ["architectural", "editorial", "technical", "warm-luxury"];

  if ("generationMode" in input) {
    const raw = input.generationMode ?? null;
    (out as BrandBackgroundUpdateData).generationMode =
      raw && VALID_MODES.includes(raw as BackgroundGenerationMode)
        ? (raw as BackgroundGenerationMode)
        : null;
  }

  if ("stylePreset" in input) {
    const raw = input.stylePreset ?? null;
    (out as BrandBackgroundUpdateData).stylePreset =
      raw && VALID_PRESETS.includes(raw as BackgroundStylePreset)
        ? (raw as BackgroundStylePreset)
        : null;
  }

  if ("compositionSeed" in input) {
    (out as BrandBackgroundUpdateData).compositionSeed = input.compositionSeed ?? null;
  }

  // Post condition: allow base-color-only backgrounds OR any overlay combination.
  const finalBase =
    "baseColorHex" in out
      ? (out as BrandBackgroundUpdateData).baseColorHex
      : existing?.baseColorHex ?? null;
  const finalOverlayUrl =
    "overlayImageUrl" in out
      ? (out as BrandBackgroundUpdateData).overlayImageUrl
      : existing?.overlayImageUrl ?? null;
  const finalOverlayKey =
    "overlayImageKey" in out
      ? (out as BrandBackgroundUpdateData).overlayImageKey
      : existing?.overlayImageKey ?? null;
  const finalOverlayIconId =
    "overlayIconId" in out
      ? (out as BrandBackgroundUpdateData).overlayIconId
      : existing?.overlayIconId ?? null;

  // If an image overlay is set, require both URL + key together.
  if ((finalOverlayUrl && !finalOverlayKey) || (!finalOverlayUrl && finalOverlayKey)) {
    return {
      error:
        "Overlay image URL and key must both be set together, or both be empty.",
    };
  }

  // Disallow backgrounds that have neither base color nor any overlay at all.
  if (!finalBase && !finalOverlayUrl && !finalOverlayIconId) {
    return {
      error:
        "Background must have either a base color or an overlay (image or icon).",
    };
  }

  return { data: out };
}

export async function listBrandBackgrounds() {
  await requireAdmin();
  return prisma.brandBackground.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      overlayIcon: true,
    },
  });
}

export async function createBrandBackground(
  input: BrandBackgroundCreateData
): Promise<BrandBackgroundActionResult> {
  await requireAdmin();

  const { data, error } = validateAndNormalizeBackgroundInput(input);
  if (error || !data) {
    return {
      ok: false,
      errorCode: "VALIDATION",
      message: error ?? "Invalid background input",
    };
  }

  const slug = normalizeSlug((data.slug ?? "") as string);
  const existing = await prisma.brandBackground.findUnique({ where: { slug } });
  if (existing) {
    return {
      ok: false,
      errorCode: "VALIDATION",
      message: "A background with this slug already exists",
    };
  }

  if (!data.name) {
    throw new Error("Background name is required.");
  }

  const toCreate: BrandBackgroundCreateData = {
    ...data,
    name: data.name,
    slug,
    tags: data.tags ?? undefined,
  };

  try {
    const created = await prisma.brandBackground.create({
      data: {
        slug: toCreate.slug,
        name: (toCreate.name ?? "").trim(),
        baseColorHex: toCreate.baseColorHex ?? null,
        overlayImageUrl: toCreate.overlayImageUrl ?? null,
        overlayImageKey: toCreate.overlayImageKey ?? null,
        overlayIconId: toCreate.overlayIconId ?? null,
        overlayOpacity: toCreate.overlayOpacity ?? 6,
        overlayScale: toCreate.overlayScale ?? 100,
        overlaySpacing: toCreate.overlaySpacing ?? 120,
        overlayRotation: toCreate.overlayRotation ?? 0,
        isAvailable: toCreate.isAvailable ?? true,
        isActive: toCreate.isActive ?? true,
        sortOrder: toCreate.sortOrder ?? 0,
        tags: normalizeTags(toCreate.tags),
        generationMode: toCreate.generationMode ?? null,
        stylePreset: toCreate.stylePreset ?? null,
        compositionSeed: toCreate.compositionSeed ?? null,
      },
    });

    // Generate preview synchronously so the caller receives the final composed image.
    const withPreview =
      (await generateAndStoreBackgroundPreview(created.id)) ?? created;

    revalidatePath("/admin/settings");
    return { ok: true, background: withPreview };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[createBrandBackground] Prisma error", err);
    return {
      ok: false,
      errorCode: "UNKNOWN",
      message:
        err instanceof Error
          ? err.message
          : "Failed to create background",
    };
  }
}

export async function updateBrandBackground(
  id: string,
  patch: BrandBackgroundUpdateData
): Promise<BrandBackgroundActionResult> {
  await requireAdmin();
  const existing = await prisma.brandBackground.findUnique({ where: { id } });
  if (!existing) {
    return {
      ok: false,
      errorCode: "NOT_FOUND",
      message: "Background not found",
    };
  }

  const { data, error } = validateAndNormalizeBackgroundInput(patch, existing);
  if (error || !data) {
    return {
      ok: false,
      errorCode: "VALIDATION",
      message: error ?? "Invalid background input",
    };
  }

  let slug: string | undefined;
  if (data.slug !== undefined) {
    slug = normalizeSlug(data.slug);
    const slugValidation = validateSlug(slug);
    if (slugValidation.error) {
      return {
        ok: false,
        errorCode: "VALIDATION",
        message: slugValidation.error,
      };
    }
    const duplicate = await prisma.brandBackground.findFirst({
      where: { slug, id: { not: id } },
    });
    if (duplicate) {
      return {
        ok: false,
        errorCode: "VALIDATION",
        message: "A background with this slug already exists",
      };
    }
  }

  const tags =
    data.tags !== undefined ? normalizeTags(data.tags ?? undefined) : undefined;

  try {
    const updated = await prisma.brandBackground.update({
      where: { id },
      data: {
        ...(slug !== undefined && { slug }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.baseColorHex !== undefined && {
          baseColorHex: data.baseColorHex,
        }),
        ...(data.overlayImageUrl !== undefined && {
          overlayImageUrl: data.overlayImageUrl,
        }),
        ...(data.overlayImageKey !== undefined && {
          overlayImageKey: data.overlayImageKey,
        }),
        ...(data.overlayIconId !== undefined && {
          overlayIconId: data.overlayIconId,
        }),
        ...(data.overlayOpacity !== undefined && {
          overlayOpacity: data.overlayOpacity,
        }),
        ...(data.overlayScale !== undefined && {
          overlayScale: data.overlayScale,
        }),
        ...(data.overlaySpacing !== undefined && {
          overlaySpacing: data.overlaySpacing,
        }),
        ...(data.overlayRotation !== undefined && {
          overlayRotation: data.overlayRotation,
        }),
        ...(tags !== undefined && { tags }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isAvailable !== undefined && {
          isAvailable: data.isAvailable,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.generationMode !== undefined && { generationMode: data.generationMode }),
        ...(data.stylePreset !== undefined && { stylePreset: data.stylePreset }),
        ...(data.compositionSeed !== undefined && { compositionSeed: data.compositionSeed }),
      },
    });

    // Regenerate preview after any update to background configuration and
    // return the updated record so the caller sees the final composed preview.
    const withPreview =
      (await generateAndStoreBackgroundPreview(updated.id)) ?? updated;

    revalidatePath("/admin/settings");
    return { ok: true, background: withPreview };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[updateBrandBackground] Prisma error", err);
    return {
      ok: false,
      errorCode: "UNKNOWN",
      message:
        err instanceof Error
          ? err.message
          : "Failed to update background",
    };
  }
}

export async function toggleBrandBackgroundActive(
  id: string,
  nextIsActive: boolean
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.brandBackground.findUnique({ where: { id } });
  if (!existing) return { error: "Background not found" };

  await prisma.brandBackground.update({
    where: { id },
    data: { isActive: Boolean(nextIsActive) },
  });

  revalidatePath("/admin/settings");
  return {};
}

export async function toggleBackgroundAvailabilityAction(
  id: string
): Promise<{ error?: string; background?: BrandBackground }> {
  await requireAdmin();

  try {
    const existing = await prisma.brandBackground.findUnique({ where: { id } });
    if (!existing) {
      return { error: "Background not found" };
    }

    const updated = await prisma.brandBackground.update({
      where: { id },
      data: { isAvailable: !existing.isAvailable },
    });

    revalidatePath("/admin/settings");
    return { background: updated };
  } catch (err) {
    // Dev-only log so we can see exact Prisma error details in the terminal
    // without surfacing internal messages to end users.
    // eslint-disable-next-line no-console
    console.error("[toggleBackgroundAvailabilityAction] Prisma error", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to toggle background availability",
    };
  }
}

export async function deleteBrandBackground(
  id: string
): Promise<BrandBackgroundSimpleResult> {
  await requireAdmin();
  const existing = await prisma.brandBackground.findUnique({ where: { id } });
  if (!existing) {
    // Idempotent delete: treat missing background as success.
    revalidatePath("/admin/settings");
    return { ok: true };
  }

  const overlayKey = existing.overlayImageKey ?? null;
  const previewKey = existing.previewImageKey ?? null;

  await prisma.brandBackground.delete({ where: { id } });

  // Clean up R2 objects — collect all keys to delete (overlay + cached preview).
  const keysToDelete = [overlayKey, previewKey].filter(Boolean) as string[];
  if (keysToDelete.length > 0) {
    try {
      await deleteR2Objects(keysToDelete);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        errorCode: "UNKNOWN",
        message: `Background deleted, but failed to delete stored images from R2: ${msg}`,
      };
    }
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Preview regeneration
// ---------------------------------------------------------------------------

/**
 * Regenerate and store the preview PNG for a single background.
 * Call this from the UI when a card shows a blank thumbnail.
 */
export async function regenerateBackgroundPreviewAction(
  id: string
): Promise<BrandBackgroundActionResult> {
  await requireAdmin();

  const existing = await prisma.brandBackground.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, errorCode: "NOT_FOUND", message: "Background not found" };
  }

  const updated = await generateAndStoreBackgroundPreview(id);
  if (!updated) {
    return {
      ok: false,
      errorCode: "UNKNOWN",
      message: "Preview regeneration failed — check that the overlay image is still accessible.",
    };
  }

  revalidatePath("/admin/settings");
  return { ok: true, background: updated };
}

/**
 * Backfill preview images for every BrandBackground that has a null or missing
 * previewImageUrl. Run once from the UI to fix existing records.
 * Returns counts of successes and failures.
 */
export async function backfillAllBackgroundPreviewsAction(): Promise<{
  ok: boolean;
  message: string;
  succeeded: number;
  failed: number;
}> {
  await requireAdmin();

  const targets = await prisma.brandBackground.findMany({
    where: {
      OR: [
        { previewImageUrl: null },
        { previewImageKey: null },
      ],
    },
    select: { id: true },
  });

  let succeeded = 0;
  let failed = 0;

  for (const { id } of targets) {
    const result = await generateAndStoreBackgroundPreview(id);
    if (result) {
      succeeded++;
    } else {
      failed++;
    }
  }

  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: `Backfill complete: ${succeeded} updated, ${failed} failed.`,
    succeeded,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Text Zone Analysis
// ---------------------------------------------------------------------------

// Seed-to-zone derivation table (no API call needed)
const SEED_ZONES: Record<string, Omit<TextZoneSuggestion, "analyzedAt" | "source">> = {
  "left-weighted":  { x: 0.32, y: 0.10, width: 0.62, height: 0.80, padding: 0.04, textAlign: "left",   recommendedTextColor: "dark",  confidence: 0.92 },
  "right-weighted": { x: 0.06, y: 0.10, width: 0.62, height: 0.80, padding: 0.04, textAlign: "left",   recommendedTextColor: "dark",  confidence: 0.92 },
  "bottom-fade":    { x: 0.08, y: 0.06, width: 0.84, height: 0.65, padding: 0.04, textAlign: "center", recommendedTextColor: "dark",  confidence: 0.90 },
  "corner":         { x: 0.22, y: 0.06, width: 0.72, height: 0.88, padding: 0.04, textAlign: "left",   recommendedTextColor: "dark",  confidence: 0.88 },
  "split-diptych":  { x: 0.08, y: 0.00, width: 0.84, height: 0.16, padding: 0.04, textAlign: "center", recommendedTextColor: "dark",  confidence: 0.85 },
};

export async function analyzeBackgroundTextZoneAction(
  backgroundId: string
): Promise<{ ok: true; zone: TextZoneSuggestion } | { ok: false; error: string }> {
  await requireAdmin();

  const bg = await prisma.brandBackground.findUnique({ where: { id: backgroundId } });
  if (!bg) return { ok: false, error: "Background not found." };

  // Return cached suggestion if fresh (< 30 days)
  if (bg.textZoneSuggestion) {
    const cached = bg.textZoneSuggestion as TextZoneSuggestion;
    const age = Date.now() - new Date(cached.analyzedAt).getTime();
    if (age < 30 * 24 * 60 * 60 * 1000) return { ok: true, zone: cached };
  }

  // Derive deterministically if composition seed is known
  if (bg.compositionSeed && SEED_ZONES[bg.compositionSeed]) {
    const zone: TextZoneSuggestion = {
      ...SEED_ZONES[bg.compositionSeed],
      source: "derived",
      analyzedAt: new Date().toISOString(),
    };
    await prisma.brandBackground.update({
      where: { id: backgroundId },
      data: { textZoneSuggestion: zone as unknown as Prisma.InputJsonValue },
    });
    return { ok: true, zone };
  }

  // Fall back to Gemini vision analysis
  const imageUrl = bg.previewImageUrl ?? bg.overlayImageUrl;
  if (!imageUrl) {
    // Return a safe default zone
    const fallback: TextZoneSuggestion = {
      x: 0.05, y: 0.08, width: 0.55, height: 0.84, padding: 0.04,
      textAlign: "left", recommendedTextColor: "dark", confidence: 0.40,
      source: "ai-vision", analyzedAt: new Date().toISOString(),
    };
    return { ok: true, zone: fallback };
  }

  try {
    const zone = await analyzeImageTextZoneWithGemini(imageUrl);
    await prisma.brandBackground.update({
      where: { id: backgroundId },
      data: { textZoneSuggestion: zone as unknown as Prisma.InputJsonValue },
    });
    return { ok: true, zone };
  } catch (err) {
    console.error("[analyzeBackgroundTextZoneAction] Gemini vision failed:", err);
    const fallback: TextZoneSuggestion = {
      x: 0.05, y: 0.08, width: 0.55, height: 0.84, padding: 0.04,
      textAlign: "left", recommendedTextColor: "dark", confidence: 0.30,
      source: "ai-vision", analyzedAt: new Date().toISOString(),
    };
    return { ok: true, zone: fallback };
  }
}

async function analyzeImageTextZoneWithGemini(imageUrl: string): Promise<TextZoneSuggestion> {
  // Fetch image bytes
  const res = await fetch(imageUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") ?? "image/png";
  const base64 = buffer.toString("base64");

  const prompt = `You are analyzing a presentation slide background image for text placement.

Find the single largest region with:
- Uniform, low-contrast tonality
- No visible texture, edges, or objects
- Enough space for a headline and 2–3 lines of body copy

Return ONLY this JSON object. No explanation, no markdown.
{"x":0.0,"y":0.0,"width":0.6,"height":0.8,"textAlign":"left","recommendedTextColor":"dark","confidence":0.85}

Rules:
- x, y, width, height normalized 0.0–1.0 (x+width ≤ 1.0, y+height ≤ 1.0)
- minimum width 0.35, minimum height 0.30
- textAlign: "left" if zone in left half, "right" if right half, "center" if centered
- recommendedTextColor: "dark" if zone is light/neutral, "light" if zone is dark
- confidence: 0.0–1.0`;

  const textZoneApiKey = await getGeminiApiKey();
  const textZoneModel = await getGeminiImageModel();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${textZoneModel}:generateContent?key=${textZoneApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 200 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini vision failed: ${response.status}`);

  const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Extract JSON from response
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in Gemini response");

  const parsed = JSON.parse(match[0]) as {
    x: number; y: number; width: number; height: number;
    textAlign: string; recommendedTextColor: string; confidence: number;
  };

  return {
    x: Math.max(0, Math.min(0.65, parsed.x)),
    y: Math.max(0, Math.min(0.70, parsed.y)),
    width: Math.max(0.35, Math.min(1 - parsed.x, parsed.width)),
    height: Math.max(0.30, Math.min(1 - parsed.y, parsed.height)),
    padding: 0.04,
    textAlign: (["left","center","right"].includes(parsed.textAlign) ? parsed.textAlign : "left") as "left" | "center" | "right",
    recommendedTextColor: (parsed.recommendedTextColor === "light" ? "light" : "dark") as "light" | "dark",
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    source: "ai-vision",
    analyzedAt: new Date().toISOString(),
  };
}

