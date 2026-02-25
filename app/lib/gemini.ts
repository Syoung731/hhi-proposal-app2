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
