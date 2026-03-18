 "use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { uploadBuffer, deleteR2Objects } from "@/app/lib/s3";
import { GoogleGenAI } from "@google/genai";
import type { BrandBackground } from "@/app/generated/prisma";
import sharp from "sharp";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";

const BACKGROUND_SYSTEM_PREFIX = `Create a seamless, tileable, subtle background texture.
No focal point.
Low contrast.
No text.
No logos.
Designed for use behind presentation content.`;

const NUM_IMAGES = 4;

export type BackgroundImageType = "subtle_texture" | "icon_pattern" | "gradient_texture";

export type BrandBackgroundActionErrorCode = "NOT_FOUND" | "VALIDATION" | "UNKNOWN";

export type BrandBackgroundActionResult =
  | { ok: true; background: BrandBackground }
  | { ok: false; errorCode: BrandBackgroundActionErrorCode; message: string };

export type BrandBackgroundSimpleResult =
  | { ok: true }
  | { ok: false; errorCode: BrandBackgroundActionErrorCode; message: string };

function buildBackgroundPrompt(userPrompt: string, type: BackgroundImageType): string {
  const trimmed = (userPrompt ?? "").trim() || "Subtle paper-like texture for document background";
  const styleHint =
    type === "icon_pattern"
      ? "Subtle repeating pattern of small motifs or shapes, very low contrast."
      : type === "gradient_texture"
        ? "Very subtle gradient with light texture, low contrast, neutral."
        : "Subtle, even texture; no strong focal point.";
  return `${BACKGROUND_SYSTEM_PREFIX}

Style description:
${styleHint}

User description: ${trimmed}

Output a single square image, high resolution (at least 1024x1024, preferably 2048x2048). PNG format.`;
}

export type GenerateBackgroundImagesInput = {
  prompt: string;
  type: BackgroundImageType;
};

export type GenerateBackgroundImagesResult = {
  error?: string;
  images?: { imageUrl: string; imageKey: string }[];
};

/**
 * Generate 2–4 background texture images via Gemini, upload to R2, return URLs and keys.
 * Reuses the same Gemini image model and R2 upload pattern as brand icon generation.
 */
export async function generateBackgroundImagesAction(
  input: GenerateBackgroundImagesInput
): Promise<GenerateBackgroundImagesResult> {
  await requireAdmin();

  const prompt = (input.prompt ?? "").toString().trim();
  const type = input.type ?? "subtle_texture";

  if (!GEMINI_API_KEY?.trim()) {
    return { error: "GEMINI_API_KEY is not set. Add GEMINI_API_KEY to .env.local." };
  }

  const fullPrompt = buildBackgroundPrompt(prompt, type);
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.trim() });

  const generateOne = async (): Promise<{ imageUrl: string; imageKey: string } | null> => {
    let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: [
          {
            role: "user",
            parts: [{ text: fullPrompt }],
          },
        ],
        config: {
          responseModalities: ["IMAGE"],
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Gemini image request failed: ${msg}`);
    }

    const candidates = (response as { candidates?: unknown[] })?.candidates;
    const parts = (candidates?.[0] as { content?: { parts?: unknown[] } })?.content?.parts;
    if (!parts?.length) {
      throw new Error("Gemini returned no image content for background generation.");
    }

    let imageBase64: string | undefined;
    let mimeType: string | undefined;
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

    const { publicUrl, fileKey } = await uploadBuffer(objectKey, bytes, mimeType ?? "image/png");
    return { imageUrl: publicUrl, imageKey: fileKey };
  };

  const results: { imageUrl: string; imageKey: string }[] = [];
  const errors: string[] = [];

  const promises = Array.from({ length: NUM_IMAGES }, () =>
    generateOne().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      return null;
    })
  );

  const settled = await Promise.all(promises);
  for (const r of settled) {
    if (r) results.push(r);
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

  // Prefer explicit overlay image; fall back to overlay icon PNG if present.
  const overlayImageUrl =
    bg.overlayImageUrl ??
    (bg.overlayIcon ? bg.overlayIcon.imageUrl ?? null : null);

  const svg = buildBackgroundPreviewSvg({
    baseColorHex: bg.baseColorHex,
    overlayImageUrl,
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

  const key = existing.overlayImageKey ?? null;

  await prisma.brandBackground.delete({ where: { id } });

  if (key) {
    try {
      await deleteR2Objects([key]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        errorCode: "UNKNOWN",
        message: `Background deleted, but failed to delete overlay image from storage: ${msg}`,
      };
    }
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

