/**
 * Gemini client for room rendering: image + room/scope/transcript → new image.
 * Uses GEMINI_API_KEY and image-capable model (gemini-2.5-flash-image by default).
 */

import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-image";

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

  const contextParts: string[] = [
    `Room: ${roomName}`,
    `Scope / renovation description: ${scopeNarrative}`,
  ];
  if (transcriptText.trim()) {
    contextParts.push(`Additional context from project transcript: ${transcriptText.trim()}`);
  }
  if (stylePresetPrompt.trim()) {
    contextParts.push(`Style preset:\n${stylePresetPrompt.trim()}\n\nApply these style instructions (materials, palette, vibe) to the rendering while keeping the same camera angle and producing a photorealistic remodeled concept. No text or watermarks.`);
  }

  const guardrails = [
    "Keep the same camera angle/perspective and room geometry.",
    "Preserve windows/doors placement; do not invent new openings.",
    "Maintain realistic materials and construction details.",
    "Photorealistic remodel concept; no surreal elements.",
    "No text, no watermark, no labels.",
    "Output exactly ONE image.",
  ].join("\n");

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

  const textPrompt = `Edit the image with these instructions. Preserve composition, camera angle, lighting, and materials unless explicitly changed.

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
