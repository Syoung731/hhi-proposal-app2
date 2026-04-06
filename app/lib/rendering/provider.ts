/**
 * Rendering provider abstraction.
 * Supports Gemini (RENDER_PROVIDER=gemini). Can be extended for OpenAI or others.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiApiKey } from "@/app/integrations/gemini";
import { getGeminiImageModel } from "@/app/lib/ai/gemini-models";

const RENDER_PROVIDER = process.env.RENDER_PROVIDER ?? "gemini";

async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey?.trim()) {
    throw new Error(
      "Gemini API key not configured. Add it in Settings > Integrations."
    );
  }
  return new GoogleGenerativeAI(apiKey.trim());
}

/**
 * Fetch image from URL and return as base64 string and mime type.
 */
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

export type RenderRoomImageParams = {
  roomName: string;
  scopeNarrative: string;
  sourceImageUrl: string;
};

export type RenderRoomImageResult =
  | { buffer: Buffer }
  | { base64: string };

/**
 * Render a room image using the configured provider (Gemini).
 * Fetches the source image, sends it to the model with the scope narrative,
 * and returns the rendered image as a buffer (preferred) or base64.
 * Does not upload; caller (e.g. rooms/actions or media/actions) handles R2 upload.
 */
export async function renderRoomImage({
  roomName,
  scopeNarrative,
  sourceImageUrl,
}: RenderRoomImageParams): Promise<RenderRoomImageResult> {
  if (RENDER_PROVIDER !== "gemini") {
    throw new Error(
      `Unsupported RENDER_PROVIDER: ${RENDER_PROVIDER}. Set RENDER_PROVIDER=gemini and GEMINI_API_KEY in .env.local.`
    );
  }

  const client = await getGeminiClient();

  let imageBase64: string;
  let mimeType: string;
  try {
    const fetched = await fetchImageAsBase64(sourceImageUrl);
    imageBase64 = fetched.data;
    mimeType = fetched.mimeType;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error fetching source image";
    throw new Error(`Rendering failed: ${msg}`);
  }

  const prompt = `You are an expert architectural visualization artist. Your task is to transform this room image into a high-resolution, photorealistic architectural rendering.

RULES:
- Preserve the original structure, layout, and camera angle exactly. Do not change perspective or composition.
- Apply the following renovation/scope to the space: ${scopeNarrative}
- Maintain realism: lighting, materials, and proportions must look natural and professional.
- Output a single, high-resolution architectural rendering image. Do not add text, labels, or multiple images.
- Room context: ${roomName}

Generate exactly one image that shows the room after the described renovation, keeping the same viewpoint.`;

  const model = client.getGenerativeModel({
    model: await getGeminiImageModel(),
    generationConfig: {
      // Request image output (supported by Gemini 2.0 Flash for image generation)
      responseModalities: ["IMAGE", "TEXT"],
    } as import("@google/generative-ai").GenerationConfig & { responseModalities?: string[] },
  });

  let result: Awaited<ReturnType<typeof model.generateContent>>;
  try {
    result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Gemini API failed: ${msg}`);
  }

  const response = result.response;
  if (!response?.candidates?.length) {
    const feedback = response?.promptFeedback;
    const reason = feedback?.blockReason ?? "No candidates returned";
    throw new Error(`Gemini returned no image: ${reason}. ${feedback?.blockReasonMessage ?? ""}`);
  }

  const parts = response.candidates[0]?.content?.parts;
  if (!parts?.length) {
    throw new Error("Gemini returned no content parts.");
  }

  for (const part of parts) {
    const partWithData = part as { inlineData?: { mimeType?: string; data?: string } };
    if (partWithData.inlineData?.data) {
      const base64 = partWithData.inlineData.data;
      const buffer = Buffer.from(base64, "base64");
      return { buffer };
    }
  }

  throw new Error("Gemini response did not contain an image (no inlineData with image data).");
}
