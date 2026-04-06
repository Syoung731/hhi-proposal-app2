import { prisma } from "@/app/lib/prisma";

/** Default Gemini model for image understanding, rendering, and vision tasks. */
export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

/** Default Imagen model for text-to-image generation (slide backgrounds, icons). */
export const DEFAULT_GEMINI_IMAGE_GEN_MODEL = "imagen-4.0-fast-generate-001";

/**
 * Get the Gemini image model configured in Settings > Integrations.
 * Used for: room rendering, image editing, vision comparison, text zone detection.
 */
export async function getGeminiImageModel(): Promise<string> {
  try {
    const settings = await prisma.companySettings.findFirst({
      select: { geminiImageModel: true },
    });
    return settings?.geminiImageModel?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
  } catch {
    return DEFAULT_GEMINI_IMAGE_MODEL;
  }
}

/**
 * Get the Gemini Imagen model configured in Settings > Integrations.
 * Used for: text-to-image generation (slide backgrounds, brand icons).
 */
export async function getGeminiImageGenModel(): Promise<string> {
  try {
    const settings = await prisma.companySettings.findFirst({
      select: { geminiImageGenModel: true },
    });
    return settings?.geminiImageGenModel?.trim() || DEFAULT_GEMINI_IMAGE_GEN_MODEL;
  } catch {
    return DEFAULT_GEMINI_IMAGE_GEN_MODEL;
  }
}
