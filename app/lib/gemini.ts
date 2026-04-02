/**
 * Gemini client for room rendering: image + room/scope/transcript → new image.
 * Uses GEMINI_API_KEY and image-capable model (gemini-2.5-flash-image by default).
 */

import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-image";

/**
 * Model for text-to-image generation (no input image required).
 * Separate from GEMINI_MODEL which is used for image-in → image-out editing.
 * Override via GEMINI_IMAGE_GEN_MODEL env var if needed.
 */
const GEMINI_IMAGE_GEN_MODEL =
  process.env.GEMINI_IMAGE_GEN_MODEL ?? "imagen-4.0-fast-generate-001";

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
  if (!GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY is not set. Add GEMINI_API_KEY to .env.local.");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.trim() });

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

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
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
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
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
    throw new Error(`Gemini returned no image: ${reason}. ${detail}`.trim());
  }

  const parts = (candidates[0] as { content?: { parts?: unknown[] } })?.content?.parts;
  if (!parts?.length) {
    throw new Error("Gemini returned no content parts.");
  }

  for (const part of parts) {
    const partWithData = part as { inlineData?: { mimeType?: string; data?: string } };
    if (partWithData.inlineData?.data) {
      const base64 = partWithData.inlineData.data;
      const mimeType = partWithData.inlineData.mimeType ?? "image/png";
      const bytes = Buffer.from(base64, "base64");
      return { bytes, mimeType };
    }
  }

  throw new Error(
    "Gemini returned no image: response contained no part with inlineData (image bytes)."
  );
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
  if (!GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY is not set. Add GEMINI_API_KEY to .env.local.");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.trim() });
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

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
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
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
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
    if (reason === "PROHIBITED_CONTENT") {
      throw new Error(
        "Gemini blocked this edit as unsafe (PROHIBITED_CONTENT). This sometimes happens even for harmless interior-design edits. Try rephrasing in neutral design language, for example: \"Change the vanity cabinet color to blue. No people or faces, just recolor the cabinetry.\""
      );
    }
    throw new Error(`Gemini returned no image: ${reason}. ${detail}`.trim());
  }

  const parts = (candidates[0] as { content?: { parts?: unknown[] } })?.content?.parts;
  if (!parts?.length) {
    throw new Error("Gemini returned no content parts.");
  }

  for (const part of parts) {
    const partWithData = part as { inlineData?: { mimeType?: string; data?: string } };
    if (partWithData.inlineData?.data) {
      const base64 = partWithData.inlineData.data;
      const mimeType = partWithData.inlineData.mimeType ?? "image/png";
      const bytes = Buffer.from(base64, "base64");
      return { bytes, mimeType };
    }
  }

  throw new Error(
    "Gemini returned no image: response contained no part with inlineData (image bytes)."
  );
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
  if (!GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY is not set. Add GEMINI_API_KEY to .env.local.");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.trim() });
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
      model: GEMINI_MODEL,
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
  if (!GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY is not set. Add GEMINI_API_KEY to .env.local.");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.trim() });

  let response: Awaited<ReturnType<typeof ai.models.generateImages>>;
  try {
    response = await ai.models.generateImages({
      model: GEMINI_IMAGE_GEN_MODEL,
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
