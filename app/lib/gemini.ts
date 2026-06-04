/**
 * Gemini client for room rendering: image + room/scope/transcript → new image.
 * Uses GEMINI_API_KEY and image-capable model (gemini-2.5-flash-image by default).
 */

import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey } from "@/app/integrations/gemini";
import { getGeminiImageModel, getGeminiImageGenModel, DEFAULT_GEMINI_IMAGE_MODEL } from "@/app/lib/ai/gemini-models";

/** Create a GoogleGenAI client using the configured API key. */
async function getGeminiClient(): Promise<GoogleGenAI> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey?.trim()) {
    throw new Error("Gemini API key not configured. Add it in Settings > Integrations.");
  }
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

/**
 * Call a Gemini image-editing model with automatic fallback.
 * If the user-selected model fails (no content parts / unsupported), retries with
 * the default image model (gemini-2.5-flash-image) which is known to support
 * image-in → image-out editing with responseModalities: ["TEXT", "IMAGE"].
 */
async function callGeminiImageEdit(
  ai: GoogleGenAI,
  contents: Parameters<typeof ai.models.generateContent>[0]["contents"],
): Promise<{ bytes: Buffer; mimeType: string }> {
  const selectedModel = await getGeminiImageModel();
  const models = [selectedModel];
  if (selectedModel !== DEFAULT_GEMINI_IMAGE_MODEL) {
    models.push(DEFAULT_GEMINI_IMAGE_MODEL);
  }

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isFallback = i > 0;
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: { responseModalities: ["TEXT", "IMAGE"] },
      });

      const candidates = (response as { candidates?: unknown[] })?.candidates;
      if (!candidates?.length) {
        const feedback = (response as { promptFeedback?: { blockReason?: string; blockReasonMessage?: string } })?.promptFeedback;
        const reason = feedback?.blockReason ?? "No candidates returned";
        const detail = feedback?.blockReasonMessage ?? "";
        if (reason === "PROHIBITED_CONTENT") {
          throw new Error(
            "Gemini blocked this edit as unsafe (PROHIBITED_CONTENT). Try rephrasing in neutral design language."
          );
        }
        if (!isFallback && models.length > 1) {
          // eslint-disable-next-line no-console
          console.warn(`[gemini] Model ${model} returned no candidates — falling back to ${models[i + 1]}`);
          continue;
        }
        throw new Error(`Gemini returned no image: ${reason}. ${detail}`.trim());
      }

      const parts = (candidates[0] as { content?: { parts?: unknown[] } })?.content?.parts;
      if (!parts?.length) {
        if (!isFallback && models.length > 1) {
          // eslint-disable-next-line no-console
          console.warn(`[gemini] Model ${model} returned no content parts — falling back to ${models[i + 1]}`);
          continue;
        }
        throw new Error("Gemini returned no content parts.");
      }

      for (const part of parts) {
        const partWithData = part as { inlineData?: { mimeType?: string; data?: string } };
        if (partWithData.inlineData?.data) {
          if (isFallback) {
            // eslint-disable-next-line no-console
            console.log(`[gemini] Fallback to ${model} succeeded`);
          }
          return {
            bytes: Buffer.from(partWithData.inlineData.data, "base64"),
            mimeType: partWithData.inlineData.mimeType ?? "image/png",
          };
        }
      }

      if (!isFallback && models.length > 1) {
        // eslint-disable-next-line no-console
        console.warn(`[gemini] Model ${model} returned no image data — falling back to ${models[i + 1]}`);
        continue;
      }
      throw new Error("Gemini returned no image: response contained no part with inlineData.");
    } catch (e) {
      if (isFallback || models.length === 1) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("PROHIBITED_CONTENT")) throw e; // Don't retry content blocks
      // eslint-disable-next-line no-console
      console.warn(`[gemini] Model ${model} failed: ${msg} — falling back to ${models[i + 1]}`);
    }
  }
  throw new Error("All Gemini image models failed");
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch source image: ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const mimeType = contentType.split(";")[0]?.trim() ?? "image/jpeg";
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const data = buffer.toString("base64");
  return { data, mimeType };
}

export type GenerateRoomRenderingParams = {
  imageUrl: string;
  roomName: string;
  scopeNarrative: string;
  transcriptText?: string;
  stylePresetPrompt?: string;
  promptVersion?: number;
};

export type GenerateRoomRenderingResult = {
  bytes: Buffer;
  mimeType: string;
};

/**
 * Generate a photorealistic remodeled concept rendering from a source photo and room context.
 * System intent: create a realistic remodeled concept rendering.
 * Inputs: source photo (image) + room name, scope narrative, optional transcript.
 * Output: one photorealistic image, similar perspective, no surreal elements, no text/watermarks.
 */
export async function generateRoomRendering({
  imageUrl,
  roomName,
  scopeNarrative,
  transcriptText = "",
  stylePresetPrompt = "",
  promptVersion = 1,
}: GenerateRoomRenderingParams): Promise<GenerateRoomRenderingResult> {
  const ai = await getGeminiClient();

  const { data: imageBase64, mimeType: sourceMimeType } = await fetchImageAsBase64(imageUrl);

  const contextParts: string[] = [];
  if (roomName.trim()) {
    contextParts.push(`Room: ${roomName}`);
  }
  // Remodel actions: ONLY the provided scopeNarrative (from Media tab = checked checklist items only). Do not add any other scope or transcript here.
  if (scopeNarrative.trim()) {
    contextParts.push(`Scope / renovation description: ${scopeNarrative}`);
  }
  if (transcriptText != null && transcriptText.trim()) {
    contextParts.push(`Additional context from project transcript: ${transcriptText.trim()}`);
  }
  if (stylePresetPrompt.trim()) {
    contextParts.push(`Style preset:\n${stylePresetPrompt.trim()}\n\nApply these style instructions (materials, palette, vibe) to the rendering while keeping the same camera angle and producing a photorealistic remodeled concept. No text or watermarks.`);
  }

  // DEBUG: final remodel-action block (remove or gate behind env in production)
  if (process.env.NODE_ENV !== "production") {
    console.log("[generateRoomRendering] final remodel/context in Gemini prompt:", {
      roomName: roomName.trim() || "(none)",
      scopeNarrative: scopeNarrative.trim() || "(none)",
      transcriptIncluded: transcriptText != null && transcriptText.trim().length > 0,
      contextPartsCount: contextParts.length,
    });
  }

  const guardrails = [
    "Keep the same camera angle/perspective and room geometry.",
    "Preserve windows/doors placement; do not invent new openings.",
    "Maintain realistic materials and construction details.",
    "Photorealistic remodel concept; no surreal elements.",
    "No text, no watermark, no labels.",
    "Output exactly ONE image.",
    "",
    "CRITICAL – only modify what is visible:",
    "Only modify elements that are clearly visible in the source image.",
    "Do not add, reveal, invent, or move fixtures that are not visible in the source image.",
    "Do not create a shower, tub, vanity, toilet, wall opening, or glass enclosure unless it is clearly visible in the source image AND explicitly listed in the render changes above.",
    "If a requested change applies to an area not visible in the photo, ignore that change.",
    "Preserve exact camera angle, framing, layout, and visible room boundaries.",
  ].join("\n");

  if (process.env.NODE_ENV !== "production") {
    console.log("[generateRoomRendering] final negative guardrail block:", guardrails.slice(0, 400) + (guardrails.length > 400 ? "…" : ""));
  }

  const textPrompt = `Create a realistic remodeled concept rendering based on this room photo and the following context.

${contextParts.join("\n\n")}

Requirements:
- Output exactly one photorealistic remodeled concept rendering.
- Keep perspective and composition similar to the original photo.
- Avoid surreal or unrealistic elements; keep it professional and believable.
- No text overlays, no watermarks, no labels.

Global rendering guardrails:
${guardrails}`;

  return callGeminiImageEdit(ai, [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: sourceMimeType,
            data: imageBase64,
          },
        },
        { text: textPrompt },
      ],
    },
  ]);
}

export type GenerateRenderEditParams = {
  imageUrl: string;
  instruction: string;
  stylePresetPrompt?: string;
};

/**
 * Edit an existing render image with a text instruction (image-to-image).
 * Preserves composition, camera angle, lighting, and materials unless explicitly changed.
 * Instruction has highest priority; style preset is additional guidance only.
 */
export async function generateRenderEdit({
  imageUrl,
  instruction,
  stylePresetPrompt = "",
}: GenerateRenderEditParams): Promise<GenerateRoomRenderingResult> {
  const ai = await getGeminiClient();
  const { data: imageBase64, mimeType: sourceMimeType } = await fetchImageAsBase64(imageUrl);

  const styleGuidance = stylePresetPrompt.trim()
    ? `\n\nAdditional style guidance (do not override the user instruction): ${stylePresetPrompt.trim()}`
    : "";

  const textPrompt = `You are editing an interior design rendering of a room or bathroom vanity. The image contains only architecture, cabinetry, countertops, fixtures, and other inanimate objects. There are no people, faces, bodies, animals, or medical content.

Edit the image with these instructions. Preserve composition, camera angle, lighting, and materials unless explicitly changed.

Instruction: ${instruction.trim()}${styleGuidance}

Requirements:
- Output exactly one photorealistic image.
- Keep perspective and composition similar unless the instruction says otherwise.
- No text overlays, no watermarks, no labels.`;

  return callGeminiImageEdit(ai, [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: sourceMimeType,
            data: imageBase64,
          },
        },
        { text: textPrompt },
      ],
    },
  ]);
}

export type CompareSourceAndRenderResult = {
  differences: string[] | null; // null = no meaningful differences
};

/**
 * Compare a source image and a render image using vision; return 3–6 bullet differences or null if none meaningful.
 * Text-only response (no image generation).
 */
export async function compareSourceAndRenderImages(
  sourceImageUrl: string,
  renderImageUrl: string
): Promise<CompareSourceAndRenderResult> {
  const ai = await getGeminiClient();
  const [source, render] = await Promise.all([
    fetchImageAsBase64(sourceImageUrl),
    fetchImageAsBase64(renderImageUrl),
  ]);

  const textPrompt = `You are comparing two images: the first is the SOURCE (original) photo, the second is a RENDERED/CONCEPT version (e.g. a renovation or design concept based on the source).

List 3 to 6 specific, meaningful visual differences between the source and the render. Focus on: layout changes, materials, colors, furniture, fixtures, lighting, structural or style changes. Be concise (one short phrase per bullet).

If the two images are effectively the same (e.g. no meaningful visual differences), respond with exactly: NONE

Format your response as follows:
- If there are differences: output one bullet per line, each line starting with a hyphen and a space (e.g. "- New cabinetry style").
- If there are no meaningful differences: output exactly the word NONE on its own line.

Do not include any other text, headers, or numbering. Only the bullets or NONE.`;

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: await getGeminiImageModel(),
      contents: [
        {
          role: "user",
          parts: [
            { text: "Image 1 (SOURCE - original):" },
            {
              inlineData: {
                mimeType: source.mimeType,
                data: source.data,
              },
            },
            { text: "Image 2 (RENDER - concept):" },
            {
              inlineData: {
                mimeType: render.mimeType,
                data: render.data,
              },
            },
            { text: textPrompt },
          ],
        },
      ],
      config: {
        responseModalities: ["TEXT"],
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Gemini API failed: ${msg}`);
  }

  const candidates = (response as { candidates?: unknown[] })?.candidates;
  if (!candidates?.length) {
    const feedback = (response as { promptFeedback?: { blockReason?: string; blockReasonMessage?: string } })?.promptFeedback;
    const reason = feedback?.blockReason ?? "No candidates returned";
    const detail = feedback?.blockReasonMessage ?? "";
    throw new Error(`Gemini compare failed: ${reason}. ${detail}`.trim());
  }

  const parts = (candidates[0] as { content?: { parts?: { text?: string }[] } })?.content?.parts;
  const textPart = parts?.find((p): p is { text: string } => typeof (p as { text?: string }).text === "string");
  const raw = textPart?.text?.trim() ?? "";

  if (!raw) {
    return { differences: null };
  }

  const upper = raw.toUpperCase();
  if (upper === "NONE" || upper.startsWith("NONE\n") || upper.endsWith("\nNONE")) {
    return { differences: null };
  }

  const bullets = raw
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0 && !/^none$/i.test(line));

  if (bullets.length === 0) {
    return { differences: null };
  }

  return {
    differences: bullets.slice(0, 6),
  };
}

// ─── Photo fixture detection (for scope-aware before/after) ─────────────────────

/**
 * Items we ask the vision model to confirm presence of in a before photo. These
 * are the renovation elements most prone to AI "hallucination" if rendered when
 * they aren't actually in the source image (e.g. adding a shower to a wall that
 * has none). Surface finishes (paint, flooring) are intentionally NOT gated this
 * hard — they apply to whatever surfaces are visible.
 */
export const PHOTO_FIXTURE_TAXONOMY = [
  "shower",
  "bathtub",
  "tub/shower combo",
  "vanity",
  "bathroom sink",
  "toilet",
  "mirror",
  "kitchen cabinets",
  "kitchen island",
  "countertops",
  "backsplash",
  "kitchen sink",
  "range or stove",
  "wall oven",
  "refrigerator",
  "dishwasher",
  "range hood",
  "fireplace",
  "windows",
  "interior door",
  "staircase",
  "built-in shelving",
] as const;

export type DetectedFixture = { name: string; visible: boolean; confidence: number };
export type DetectPhotoFixturesResult = { fixtures: DetectedFixture[] };

/**
 * Ask Gemini vision which taxonomy fixtures are CLEARLY VISIBLE in a single
 * source photo. Returns one entry per taxonomy item. On any failure (API error,
 * unparseable response) returns an empty list — callers treat "no detection"
 * as "unknown" and fall back to asking the user rather than auto-rendering.
 */
export async function detectPhotoFixtures(
  imageUrl: string,
): Promise<DetectPhotoFixturesResult> {
  const ai = await getGeminiClient();
  const img = await fetchImageAsBase64(imageUrl);

  const textPrompt = `You are a renovation estimator examining ONE room photo. For EACH item in the list, decide whether it is CLEARLY VISIBLE within this photo's frame. Do NOT guess about things that might exist outside the frame or behind walls.

Items: ${PHOTO_FIXTURE_TAXONOMY.join(", ")}.

Return ONLY valid JSON (no markdown, no prose) of exactly this shape:
{"fixtures":[{"name":"<item>","visible":true,"confidence":0.0}]}
- Include one entry for EVERY item in the list, using the item's exact text as "name".
- "visible" is true only if you can actually see it in the image.
- "confidence" is 0.0 to 1.0.`;

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: await getGeminiImageModel(),
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: img.mimeType, data: img.data } },
            { text: textPrompt },
          ],
        },
      ],
      config: { responseModalities: ["TEXT"] },
    });
  } catch {
    return { fixtures: [] };
  }

  const candidates = (response as { candidates?: unknown[] })?.candidates;
  const parts = (candidates?.[0] as { content?: { parts?: { text?: string }[] } })
    ?.content?.parts;
  const textPart = parts?.find(
    (p): p is { text: string } => typeof (p as { text?: string }).text === "string",
  );
  const raw = textPart?.text?.trim() ?? "";
  if (!raw) return { fixtures: [] };

  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as { fixtures?: unknown };
    const list = Array.isArray(parsed.fixtures) ? parsed.fixtures : [];
    const fixtures: DetectedFixture[] = list
      .map((f) => {
        const o = (f ?? {}) as Record<string, unknown>;
        return {
          name: typeof o.name === "string" ? o.name : "",
          visible: o.visible === true,
          confidence: typeof o.confidence === "number" ? o.confidence : 0,
        };
      })
      .filter((f) => f.name.length > 0);
    return { fixtures };
  } catch {
    return { fixtures: [] };
  }
}

// ─── CAD Overlay generation (image-in → image-out) ─────────────────────────────

export type GenerateCadOverlayParams = {
  sourcePhotoUrl: string;
  overlayIntensity?: number;   // 0-1, default 0.7
  transitionPosition?: number; // 0-100, default 45
  cadSide?: "left" | "right";  // which side gets CAD, default "right"
};

/**
 * Generate a CAD overlay composite: one side is realistic photo, the other
 * transitions into architectural CAD line drawings. Uses image-in → image-out.
 */
export async function generateCadOverlay({
  sourcePhotoUrl,
  overlayIntensity = 0.7,
  transitionPosition = 45,
  cadSide = "right",
}: GenerateCadOverlayParams): Promise<GenerateRoomRenderingResult> {
  const ai = await getGeminiClient();
  const { data: imageBase64, mimeType: sourceMimeType } = await fetchImageAsBase64(sourcePhotoUrl);

  const intensityDesc = overlayIntensity >= 0.8 ? "very strong, highly detailed" :
    overlayIntensity >= 0.5 ? "moderate, clearly visible" : "subtle, light";

  const photoSide = cadSide === "left" ? "right" : "left";
  const textPrompt = `Transform this interior room photograph into a premium architectural composite image. Keep the ${photoSide} portion (approximately ${transitionPosition}% of the width) as a high-quality realistic photograph. Gradually transition the ${cadSide} portion into precise architectural CAD line drawings — thin, clean, technical blueprint-style line art depicting the same space. The transition should be a soft gradient fade from photo to CAD drawings. The CAD drawing portion should show architectural details: wall lines, cabinet outlines, ceiling lines, structural elements, all rendered as thin precise lines on a white or very light background. The CAD line intensity should be ${intensityDesc}. The overall image should feel like a premium design-build company cover page — professional photography meeting architectural precision. Maintain the full original image dimensions and composition. Output exactly ONE image. No text overlays, no watermarks, no labels.`;

  return callGeminiImageEdit(ai, [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: sourceMimeType,
            data: imageBase64,
          },
        },
        { text: textPrompt },
      ],
    },
  ]);
}

// ─── Text-to-image generation ─────────────────────────────────────────────────

export type GenerateSlideBackgroundResult = {
  bytes: Buffer;
  mimeType: string;
};

/**
 * Generate a slide background image from a text prompt using Imagen 4.
 * No input image required — pure text-to-image via the standard Gemini API key.
 *
 * Uses GEMINI_IMAGE_GEN_MODEL env var (default: "imagen-4.0-fast-generate-001").
 * Override with "imagen-4.0-generate-001" or "imagen-4.0-ultra-generate-001"
 * for higher quality when needed.
 *
 * This is intentionally separate from GEMINI_MODEL (image-in → image-out editing).
 */
export async function generateSlideBackground(
  prompt: string
): Promise<GenerateSlideBackgroundResult> {
  const ai = await getGeminiClient();

  let response: Awaited<ReturnType<typeof ai.models.generateImages>>;
  try {
    response = await ai.models.generateImages({
      model: await getGeminiImageGenModel(),
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/png",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Imagen image generation failed: ${msg}`);
  }

  const generated = (
    response as { generatedImages?: unknown[] }
  )?.generatedImages;

  if (!generated?.length) {
    throw new Error("Imagen returned no generated images.");
  }

  const imageData = (
    generated[0] as { image?: { imageBytes?: string; mimeType?: string } }
  )?.image;

  if (!imageData?.imageBytes) {
    throw new Error(
      "Imagen returned an image record with no imageBytes — the prompt may have been blocked."
    );
  }

  const bytes = Buffer.from(imageData.imageBytes, "base64");
  const mimeType = imageData.mimeType ?? "image/png";

  return { bytes, mimeType };
}
