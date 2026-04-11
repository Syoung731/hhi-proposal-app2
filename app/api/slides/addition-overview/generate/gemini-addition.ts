/**
 * Gemini helper for Addition Overview CAD overlay generation.
 * Uses the same image-in → image-out pattern as the Cover slide CAD overlay.
 */

import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey } from "@/app/integrations/gemini";
import { getGeminiImageModel, DEFAULT_GEMINI_IMAGE_MODEL } from "@/app/lib/ai/gemini-models";

async function getGeminiClient(): Promise<GoogleGenAI> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey?.trim()) {
    throw new Error("Gemini API key not configured. Add it in Settings > Integrations.");
  }
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") ?? "image/png";
  return { data: buffer.toString("base64"), mimeType: ct.split(";")[0].trim() };
}

export type GenerateAdditionOverlayParams = {
  sourcePhotoUrl: string;
  boundingBoxX: number;
  boundingBoxY: number;
  boundingBoxWidth: number;
  boundingBoxHeight: number;
  calloutLabel: string;
  overlayIntensity: number; // 0-100
};

export async function generateAdditionOverlayCad({
  sourcePhotoUrl,
  boundingBoxX,
  boundingBoxY,
  boundingBoxWidth,
  boundingBoxHeight,
  calloutLabel,
  overlayIntensity,
}: GenerateAdditionOverlayParams): Promise<{ bytes: Buffer; mimeType: string }> {
  const ai = await getGeminiClient();
  const { data: imageBase64, mimeType: sourceMimeType } = await fetchImageAsBase64(sourcePhotoUrl);

  const intensityPct = overlayIntensity / 100;
  const intensityDesc = intensityPct >= 0.8 ? "very strong, highly detailed" :
    intensityPct >= 0.5 ? "moderate, clearly visible" : "subtle, light";

  // Convert percentages to spatial descriptions for better Gemini adherence
  const leftDesc = boundingBoxX <= 20 ? "the left side" : boundingBoxX >= 60 ? "the right side" : "the center-horizontal area";
  const topDesc = boundingBoxY <= 20 ? "the top" : boundingBoxY >= 60 ? "the bottom" : "the middle";
  const sizeDesc = boundingBoxWidth >= 60 ? "a large portion" : boundingBoxWidth >= 30 ? "a moderate portion" : "a small portion";
  const rightEdge = boundingBoxX + boundingBoxWidth;
  const bottomEdge = boundingBoxY + boundingBoxHeight;

  const textPrompt = `You are an architectural visualization artist. Edit this exterior photograph by adding white architectural CAD line drawings ONLY within a specific rectangular region of the image. Everything outside that region must remain exactly as the original photo — completely untouched.

CRITICAL CONSTRAINT — The CAD drawings must ONLY appear inside this rectangle:
- Left edge: ${boundingBoxX}% from the left side of the image
- Right edge: ${rightEdge}% from the left side of the image
- Top edge: ${boundingBoxY}% from the top of the image
- Bottom edge: ${bottomEdge}% from the top of the image

This region is at ${leftDesc}, near ${topDesc} of the image, covering ${sizeDesc} of the total area.

DO NOT draw any lines, marks, or modifications outside this rectangle. The surrounding photo must be pixel-perfect unchanged.

Within the rectangle, add these white architectural overlay elements:
- Dashed white outline showing the proposed addition footprint
- Light dotted lines suggesting new roofline and wall planes
- Simple architectural linework for windows and doors
- Lines should follow the perspective angle of the existing building

Style requirements:
- White lines only, semi-transparent (~80% opacity)
- Thin, precise, technical drawing style
- ${intensityDesc} level of detail
- The photo underneath remains visible through the overlay
- This should look like an architect sketched the addition proposal directly onto a printed photo

Maintain full original image dimensions. Output exactly ONE image. No text, no labels, no watermarks.`;

  const selectedModel = await getGeminiImageModel();
  const models = [selectedModel];
  if (selectedModel !== DEFAULT_GEMINI_IMAGE_MODEL) {
    models.push(DEFAULT_GEMINI_IMAGE_MODEL);
  }

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: sourceMimeType, data: imageBase64 } },
              { text: textPrompt },
            ],
          },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          return {
            bytes: Buffer.from(part.inlineData.data, "base64"),
            mimeType: part.inlineData.mimeType ?? "image/png",
          };
        }
      }
      if (i < models.length - 1) continue;
      throw new Error("Gemini returned no image content");
    } catch (e) {
      if (i < models.length - 1) {
        console.warn(`[addition-overlay] Model ${model} failed, trying fallback...`);
        continue;
      }
      throw e;
    }
  }

  throw new Error("All Gemini models failed to generate image");
}
