"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { normalizeIconKey } from "@/app/lib/brand-icons";
import type { Prisma } from "@/app/generated/prisma";
import type { SectionCategory, MeasurementMode, EstimateUnit, PricingBasis } from "@/app/generated/prisma";
import { SUPER_ADMIN_EMAIL } from "@/app/lib/constants";
import { GoogleGenAI } from "@google/genai";
import { getPresignedUploadUrl, uploadBuffer, deleteR2Objects, readObjectToBuffer } from "@/app/lib/s3";
import { normalizeBudgetJson } from "@/app/lib/jobtread/budget-json-normalizer";
import { parseBudgetExportText } from "@/app/lib/jobtread/budget-text-parser";
import { syncNormalizedJobBudget } from "@/app/lib/jobtread/sync-budget";
import sharp from "sharp";

/** Get or create the singleton CompanySettings. Auto-create on first visit with defaults. */
export async function getOrCreateCompanySettings() {
  await requireAdmin();
  let settings = await prisma.companySettings.findFirst();
  if (!settings) {
    settings = await prisma.companySettings.create({
      data: {
        companyName: "",
        defaultProposalDisclaimer: "",
      },
    });
  }
  return settings;
}

export async function saveCompanyProfileAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  const companyName = (formData.get("companyName") as string)?.trim() ?? "";
  const addressLine1 = (formData.get("addressLine1") as string)?.trim() || null;
  const addressLine2 = (formData.get("addressLine2") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const state = (formData.get("state") as string)?.trim() || null;
  const zip = (formData.get("zip") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;
  const rawWebsiteUrl = formData.get("websiteUrl") as string | null;
  const websiteUrlInput = rawWebsiteUrl ? rawWebsiteUrl.trim() : "";

  let websiteUrl: string | null = null;
  if (websiteUrlInput) {
    try {
      const url = new URL(websiteUrlInput);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { error: "Website URL must start with http:// or https://" };
      }
      websiteUrl = url.toString();
    } catch {
      return { error: "Website URL must be a valid http or https URL" };
    }
  }

  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      companyName: companyName || "",
      addressLine1,
      addressLine2,
      city,
      state,
      zip,
      phone,
      email,
      websiteUrl,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

const HEX_REGEX = /^#([0-9a-fA-F]{6})$/;

function normalizeHex(value: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!HEX_REGEX.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

export async function saveBrandingAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  const logoLightUrl = (formData.get("logoLightUrl") as string)?.trim() || null;
  const logoDarkUrl = (formData.get("logoDarkUrl") as string)?.trim() || null;
  const primaryColorHexRaw = (formData.get("primaryColorHex") as string)?.trim() || null;
  const textColorHexRaw = (formData.get("textColorHex") as string)?.trim() || null;
  const primaryColorLegacy = (formData.get("primaryColor") as string)?.trim() || null;
  const primaryColorHex = normalizeHex(primaryColorHexRaw) ?? normalizeHex(primaryColorLegacy);
  const textColorHex = normalizeHex(textColorHexRaw);
  const brandTaglineRaw = formData.get("brandTagline");
  const closingHeadlineRaw = formData.get("closingHeadline");
  const brandTagline =
    typeof brandTaglineRaw === "string" ? (brandTaglineRaw.trim() || null) : undefined;
  const closingHeadline =
    typeof closingHeadlineRaw === "string" ? (closingHeadlineRaw.trim() || null) : undefined;
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      logoLightUrl,
      logoDarkUrl,
      primaryColorHex: primaryColorHex ?? undefined,
      textColorHex: textColorHex ?? undefined,
      ...(primaryColorLegacy !== null && { primaryColor: primaryColorLegacy }),
      ...(brandTagline !== undefined && { brandTagline }),
      ...(closingHeadline !== undefined && { closingHeadline }),
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

/** Save only logo URLs after upload. Used by Branding tab after successful upload. */
export async function saveBrandingLogosAction(
  logoLightUrl: string | null,
  logoDarkUrl: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      logoLightUrl: logoLightUrl ?? undefined,
      logoDarkUrl: logoDarkUrl ?? undefined,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

/** Save global Core Values defaults (JSON blob). */
export async function saveCoreValuesDefaultsAction(
  json: import("@/app/lib/core-values-defaults").GlobalCoreValuesSettings
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { coreValuesDefaultsJson: json as unknown as Prisma.JsonObject },
  });
  revalidatePath("/admin/settings");
  return {};
}

/** Save global COPE defaults (JSON blob). */
export async function saveCopeDefaultsAction(
  json: import("@/app/lib/cope-defaults").GlobalCopeSettings
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { copeDefaultsJson: json as unknown as Prisma.JsonObject },
  });
  revalidatePath("/admin/settings");
  return {};
}

/** Save global Next Steps defaults (JSON blob). */
/** Save global Design-Build Advantage defaults (JSON blob). */
export async function saveDesignBuildDefaultsAction(
  json: import("@/app/lib/design-build-defaults").GlobalDesignBuildSettings
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { designBuildDefaultsJson: json as unknown as Prisma.JsonObject },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function saveNextStepsDefaultsAction(
  json: import("@/app/lib/next-steps-defaults").GlobalNextStepsSettings
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { nextStepsDefaultsJson: json as unknown as Prisma.JsonObject },
  });
  revalidatePath("/admin/settings");
  return {};
}

// ---------------------------------------------------------------------------
// Testimonial Library
// ---------------------------------------------------------------------------

/** Fetch all approved testimonials for use in the slide editor. */
export async function getApprovedTestimonialsAction() {
  await requireAdmin();
  return prisma.testimonial.findMany({
    where: { approved: true },
    orderBy: { sortOrder: "asc" },
  });
}

/** Fetch all testimonials for the settings library UI. */
export async function getAllTestimonialsAction() {
  await requireAdmin();
  return prisma.testimonial.findMany({
    orderBy: { sortOrder: "asc" },
  });
}

/** Create a new testimonial. */
export async function createTestimonialAction(data: {
  quote: string;
  clientName: string;
  projectName?: string;
  rating?: number;
  source?: string;
  approved?: boolean;
}): Promise<{ error?: string }> {
  await requireAdmin();
  const maxSort = await prisma.testimonial.aggregate({ _max: { sortOrder: true } });
  await prisma.testimonial.create({
    data: {
      quote: data.quote,
      clientName: data.clientName,
      projectName: data.projectName || null,
      rating: data.rating ?? 5,
      source: data.source ?? "manual",
      approved: data.approved ?? true,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

/** Update an existing testimonial. */
export async function updateTestimonialAction(
  id: string,
  data: {
    quote?: string;
    clientName?: string;
    projectName?: string | null;
    rating?: number;
    approved?: boolean;
    sortOrder?: number;
  }
): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.testimonial.update({ where: { id }, data });
  revalidatePath("/admin/settings");
  return {};
}

/** Delete a testimonial. */
export async function deleteTestimonialAction(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.testimonial.delete({ where: { id } });
  revalidatePath("/admin/settings");
  return {};
}

/** Reorder testimonials by ID array. */
export async function reorderTestimonialsAction(ids: string[]): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.$transaction(
    ids.map((id, i) => prisma.testimonial.update({ where: { id }, data: { sortOrder: i } }))
  );
  revalidatePath("/admin/settings");
  return {};
}

/** Seed default testimonials if library is empty. */
export async function seedTestimonialsIfEmptyAction(): Promise<void> {
  await requireAdmin();
  const count = await prisma.testimonial.count();
  if (count > 0) return;
  await prisma.testimonial.createMany({
    data: [
      {
        quote: "From the very first meeting, we knew we were in good hands. The team was professional, communicative, and delivered exactly what they promised \u2014 on time and on budget.",
        clientName: "Christina Galbreath-Gonzalez",
        rating: 5,
        source: "manual",
        approved: true,
        sortOrder: 0,
      },
      {
        quote: "What impressed us most was the planning. There were no surprises, no change orders we didn\u2019t initiate. The finished result exceeded everything we imagined.",
        clientName: "Diane Zalewski",
        rating: 5,
        source: "manual",
        approved: true,
        sortOrder: 1,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Google Reviews Integration
// ---------------------------------------------------------------------------

import {
  getOrCreateGoogleReviewsIntegration,
  saveGoogleReviewsCredentials,
  testGoogleReviewsConnection,
} from "@/app/integrations/google-reviews";

export async function getGoogleReviewsIntegrationAction() {
  await requireAdmin();
  return getOrCreateGoogleReviewsIntegration();
}

export async function saveGoogleReviewsCredentialsAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const apiKey = (formData.get("googleReviewsApiKey") as string)?.trim() ?? "";
  const placeId = (formData.get("googleReviewsPlaceId") as string)?.trim() ?? "";
  if (!apiKey) return { error: "API key is required" };
  if (!placeId) return { error: "Place ID is required" };
  try {
    await saveGoogleReviewsCredentials(apiKey, placeId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save" };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/integrations");
  return {};
}

export async function testGoogleReviewsConnectionAction(): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  return testGoogleReviewsConnection();
}

export async function saveProposalDefaultsAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  const defaultProposalDisclaimer =
    (formData.get("defaultProposalDisclaimer") as string)?.trim() ?? "";
  const defaultTimelineNote =
    (formData.get("defaultTimelineNote") as string)?.trim() || null;
  // designHourlyRate: blank → null, otherwise parse as int. Reject negatives and
  // absurdly large values so a typo can't set "$9999999/hour" on a client slide.
  const rawRate = (formData.get("designHourlyRate") as string | null)?.trim() ?? "";
  let designHourlyRate: number | null = null;
  if (rawRate !== "") {
    const parsed = Number(rawRate);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      return { error: "Design hourly rate must be a whole number." };
    }
    if (parsed < 0 || parsed > 5000) {
      return { error: "Design hourly rate must be between 0 and 5000." };
    }
    designHourlyRate = Math.round(parsed);
  }
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      defaultProposalDisclaimer,
      defaultTimelineNote,
      designHourlyRate,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

// Room type global percentage offsets: low = target * (1 + lowPct/100), high = target * (1 + highPct/100)
const ROOM_TYPE_LOW_PCT_MIN = -80;
const ROOM_TYPE_LOW_PCT_MAX = 0;
const ROOM_TYPE_HIGH_PCT_MIN = 0;
const ROOM_TYPE_HIGH_PCT_MAX = 200;

function validateRoomTypePct(
  lowPct: number | null | undefined,
  highPct: number | null | undefined
): { error?: string } {
  if (lowPct !== null && lowPct !== undefined) {
    if (typeof lowPct !== "number" || Number.isNaN(lowPct))
      return { error: "Low % must be a number" };
    if (lowPct < ROOM_TYPE_LOW_PCT_MIN || lowPct > ROOM_TYPE_LOW_PCT_MAX)
      return { error: `Low % must be between ${ROOM_TYPE_LOW_PCT_MIN} and ${ROOM_TYPE_LOW_PCT_MAX}` };
    if (lowPct >= 0) return { error: "Low % should be below target (negative)" };
  }
  if (highPct !== null && highPct !== undefined) {
    if (typeof highPct !== "number" || Number.isNaN(highPct))
      return { error: "High % must be a number" };
    if (highPct < ROOM_TYPE_HIGH_PCT_MIN || highPct > ROOM_TYPE_HIGH_PCT_MAX)
      return { error: `High % must be between ${ROOM_TYPE_HIGH_PCT_MIN} and ${ROOM_TYPE_HIGH_PCT_MAX}` };
    if (highPct <= 0) return { error: "High % should be above target (positive)" };
  }
  if (
    lowPct != null && highPct != null &&
    typeof lowPct === "number" && !Number.isNaN(lowPct) &&
    typeof highPct === "number" && !Number.isNaN(highPct) &&
    lowPct >= highPct
  ) {
    return { error: "Low % must be less than High %" };
  }
  return {};
}

export async function saveRoomTypePctAction(
  lowPct: number | null,
  highPct: number | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const err = validateRoomTypePct(lowPct, highPct);
  if (err.error) return err;
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      roomTypeLowPct: lowPct ?? undefined,
      roomTypeHighPct: highPct ?? undefined,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

const DEFAULT_ROOM_TYPE_LOW_PCT = -10;
const DEFAULT_ROOM_TYPE_HIGH_PCT = 10;

/** Recompute and persist Low/High for all RoomTypes that have a Target, using global % from CompanySettings. Does not overwrite manual overrides (non-null Low/High). */
export async function recomputeRoomTypeLowHighAction(): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  const lowPct = settings.roomTypeLowPct ?? DEFAULT_ROOM_TYPE_LOW_PCT;
  const highPct = settings.roomTypeHighPct ?? DEFAULT_ROOM_TYPE_HIGH_PCT;

  const roomTypes = await prisma.roomType.findMany({
    where: { pricePerSqFtTarget: { not: null } },
    select: {
      id: true,
      pricePerSqFtTarget: true,
      pricePerSqFtLow: true,
      pricePerSqFtHigh: true,
    },
  });

  const updates: Array<{ id: string; pricePerSqFtLow?: number; pricePerSqFtHigh?: number }> = [];
  for (const rt of roomTypes) {
    const target = rt.pricePerSqFtTarget!;
    const computedLow = Math.floor(target * (1 + lowPct / 100));
    const computedHigh = Math.ceil(target * (1 + highPct / 100));
    const newLow = rt.pricePerSqFtLow == null ? computedLow : undefined;
    const newHigh = rt.pricePerSqFtHigh == null ? computedHigh : undefined;
    if (newLow !== undefined || newHigh !== undefined) {
      updates.push({
        id: rt.id,
        ...(newLow !== undefined && { pricePerSqFtLow: newLow }),
        ...(newHigh !== undefined && { pricePerSqFtHigh: newHigh }),
      });
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.roomType.update({
          where: { id: u.id },
          data: {
            ...(u.pricePerSqFtLow !== undefined && { pricePerSqFtLow: u.pricePerSqFtLow }),
            ...(u.pricePerSqFtHigh !== undefined && { pricePerSqFtHigh: u.pricePerSqFtHigh }),
          },
        })
      )
    );
  }
  revalidatePath("/admin/settings");
  return {};
}

export async function saveIntegrationsAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return { error: "Settings not found" };
  const integrationsJsonRaw = (formData.get("integrationsJson") as string)?.trim();
  let integrationsJson: unknown = null;
  if (integrationsJsonRaw) {
    try {
      integrationsJson = JSON.parse(integrationsJsonRaw) as unknown;
    } catch {
      return { error: "Invalid JSON" };
    }
  }
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { integrationsJson: integrationsJson as Prisma.InputJsonValue },
  });
  revalidatePath("/admin/settings");
  return {};
}

// ---------------------------------------------------------------------------
// Anthropic (Claude AI) integration
// ---------------------------------------------------------------------------

import {
  getOrCreateAnthropicIntegration,
  saveAnthropicApiKey,
  testAnthropicConnection,
} from "@/app/integrations/anthropic";

export async function getAnthropicIntegrationAction() {
  await requireAdmin();
  return getOrCreateAnthropicIntegration();
}

export async function saveAnthropicApiKeyAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const apiKey = (formData.get("anthropicApiKey") as string)?.trim() ?? "";
  if (!apiKey) return { error: "API key is required" };
  try {
    await saveAnthropicApiKey(apiKey);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save" };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/integrations");
  return {};
}

export async function testAnthropicConnectionAction(): Promise<{ ok: boolean; model?: string; error?: string }> {
  await requireAdmin();
  return testAnthropicConnection();
}

export async function saveAnthropicModelAction(model: string): Promise<{ error?: string }> {
  await requireAdmin();
  const trimmed = (model ?? "").trim();
  if (!trimmed) return { error: "Model ID is required." };
  try {
    const settings = await prisma.companySettings.findFirst();
    if (settings) {
      await prisma.companySettings.update({ where: { id: settings.id }, data: { anthropicModel: trimmed } });
    } else {
      await prisma.companySettings.create({ data: { anthropicModel: trimmed } });
    }
    revalidatePath("/admin/settings");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save model selection." };
  }
}

/**
 * Persist the bulk-estimate parallelism setting. `null` clears the override and
 * falls back to the hard-coded default (8) in `getAiEstimateConcurrency()`.
 * Bounds (1..20) match the input bounds in the admin UI — anything outside is
 * a programming bug, not user input, so we throw rather than silently clamp.
 */
export async function saveAiEstimateConcurrencyAction(
  value: number | null,
): Promise<{ error?: string }> {
  await requireAdmin();
  if (value != null) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1 || value > 20) {
      return { error: "Parallelism must be an integer between 1 and 20." };
    }
  }
  try {
    const settings = await prisma.companySettings.findFirst();
    if (settings) {
      await prisma.companySettings.update({
        where: { id: settings.id },
        data: { aiEstimateConcurrency: value },
      });
    } else {
      await prisma.companySettings.create({ data: { aiEstimateConcurrency: value } });
    }
    // The in-memory memo in `getAiEstimateConcurrency()` is TTL-bounded at 60s,
    // so the next bulk-job fan-out picks up the change within a minute without
    // any explicit invalidation wiring needed here.
    revalidatePath("/admin/settings");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save parallelism." };
  }
}

/**
 * Phase 8C: toggle the auto-fire of project overhead (COPE) when a bulk
 * estimate job lands COMPLETED. `maybeAutoTriggerCope()` in the estimate-room
 * worker reads this fresh on every completion — no cache invalidation needed.
 */
export async function saveAutoGenerateCopeAction(
  enabled: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    const settings = await prisma.companySettings.findFirst();
    if (settings) {
      await prisma.companySettings.update({
        where: { id: settings.id },
        data: { autoGenerateCope: enabled },
      });
    } else {
      await prisma.companySettings.create({ data: { autoGenerateCope: enabled } });
    }
    revalidatePath("/admin/settings");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save auto-trigger setting." };
  }
}

// ---------------------------------------------------------------------------
// Google Gemini integration (AI image generation)
// ---------------------------------------------------------------------------

import {
  getOrCreateGeminiIntegration,
  saveGeminiApiKey,
  testGeminiConnection,
} from "@/app/integrations/gemini";

export async function getGeminiIntegrationAction() {
  await requireAdmin();
  return getOrCreateGeminiIntegration();
}

export async function saveGeminiApiKeyAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const apiKey = (formData.get("geminiApiKey") as string)?.trim();
  if (!apiKey) return { error: "API key is required." };
  try {
    await saveGeminiApiKey(apiKey);
    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/integrations");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save Gemini key." };
  }
}

export async function testGeminiConnectionAction(): Promise<{ ok: boolean; model?: string; error?: string }> {
  await requireAdmin();
  return testGeminiConnection();
}

export async function saveGeminiModelsAction(
  imageModel: string,
  imageGenModel: string
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    const settings = await prisma.companySettings.findFirst();
    const data: Record<string, string | null> = {};
    if (imageModel?.trim()) data.geminiImageModel = imageModel.trim();
    if (imageGenModel?.trim()) data.geminiImageGenModel = imageGenModel.trim();
    if (settings) {
      await prisma.companySettings.update({ where: { id: settings.id }, data });
    } else {
      await prisma.companySettings.create({ data: { ...data, companyName: "" } as Parameters<typeof prisma.companySettings.create>[0]["data"] });
    }
    revalidatePath("/admin/settings");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save model selection." };
  }
}

// ---------------------------------------------------------------------------
// Google Places integration (address autocomplete)
// ---------------------------------------------------------------------------

import {
  getOrCreateGooglePlacesIntegration,
  saveGooglePlacesApiKey,
  testGooglePlacesConnection,
} from "@/app/integrations/google-places";

export async function getGooglePlacesIntegrationAction() {
  await requireAdmin();
  return getOrCreateGooglePlacesIntegration();
}

export async function saveGooglePlacesApiKeyAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const apiKey = (formData.get("googlePlacesApiKey") as string)?.trim() ?? "";
  if (!apiKey) return { error: "API key is required" };
  try {
    await saveGooglePlacesApiKey(apiKey);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save" };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/integrations");
  return {};
}

export async function testGooglePlacesConnectionAction(): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  return testGooglePlacesConnection();
}

// ---------------------------------------------------------------------------
// JobTread integration (Grant Key, base URL, test connection)
// ---------------------------------------------------------------------------

import {
  getOrCreateJobTreadIntegration,
  saveJobTreadCredentials,
  testJobTreadConnection,
} from "@/app/integrations/jobtread";

/** Get current JobTread integration state for the Integrations tab. */
export async function getJobTreadIntegrationAction() {
  await requireAdmin();
  return getOrCreateJobTreadIntegration();
}

/** Save JobTread name, base URL, and optionally grant key (leave blank to keep existing). */
export async function saveJobTreadIntegrationAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const name = (formData.get("jobtreadName") as string)?.trim() || "JobTread";
  const baseUrl = (formData.get("jobtreadBaseUrl") as string)?.trim() || undefined;
  const grantKey = (formData.get("jobtreadGrantKey") as string)?.trim() ?? "";
  try {
    await saveJobTreadCredentials({
      name,
      apiBaseUrl: baseUrl,
      ...(grantKey ? { grantKey } : {}),
      isEnabled: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save";
    return { error: message };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/integrations");
  return {};
}

/** Test JobTread API connection and update last status. */
export async function testJobTreadConnectionAction(): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  return testJobTreadConnection();
}

// ---------------------------------------------------------------------------
// Synced budget inspector (read-only, for admin debug)
// ---------------------------------------------------------------------------

export type SyncedBudgetInspectorSummary = {
  jobId: string;
  jobName: string;
  jobNumber: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  lastRowCount: number;
  officialSellTotal: string;
  officialCostTotal: string;
  sourceSummarySell: string | null;
  sourceSummaryCost: string | null;
};

export type SyncedBudgetInspectorRow = {
  id: string;
  groupName: string | null;
  itemName: string;
  costCode: string | null;
  costCodeName: string | null;
  costType: string | null;
  unit: string | null;
  quantity: string | null;
  unitCost: string | null;
  unitPrice: string | null;
  extCost: string;
  extSell: string;
};

export type SyncedBudgetInspectorResult = {
  summary: SyncedBudgetInspectorSummary | null;
  rows: SyncedBudgetInspectorRow[];
};

function decimalToDisplay(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && !Number.isNaN(value)) return value.toFixed(2);
  const s = String(value);
  if (!s) return "—";
  const n = parseFloat(s);
  return Number.isNaN(n) ? s : n.toFixed(2);
}

/** Load synced budget job summary + first 25 rows for inspector. Returns empty result if no job found. */
export async function getSyncedBudgetInspectorAction(
  jobId: string
): Promise<SyncedBudgetInspectorResult> {
  await requireAdmin();
  const trimmed = jobId?.trim();
  if (!trimmed) {
    return { summary: null, rows: [] };
  }

  const job = await prisma.syncedBudgetJob.findUnique({
    where: { jobId: trimmed },
  });
  if (!job) {
    return { summary: null, rows: [] };
  }

  const rows = await prisma.syncedBudgetRow.findMany({
    where: { jobId: trimmed },
    orderBy: [{ groupName: "asc" }, { itemName: "asc" }, { id: "asc" }],
    take: 25,
  });

  const summary: SyncedBudgetInspectorSummary = {
    jobId: job.jobId,
    jobName: job.jobName,
    jobNumber: job.jobNumber ?? null,
    lastSyncedAt: job.lastSyncedAt?.toISOString() ?? null,
    lastSyncStatus: job.lastSyncStatus ?? null,
    lastSyncMessage: job.lastSyncMessage ?? null,
    lastRowCount: job.lastRowCount,
    officialSellTotal: decimalToDisplay(job.officialSellTotal),
    officialCostTotal: decimalToDisplay(job.officialCostTotal),
    sourceSummarySell: job.sourceSummarySell != null ? decimalToDisplay(job.sourceSummarySell) : null,
    sourceSummaryCost: job.sourceSummaryCost != null ? decimalToDisplay(job.sourceSummaryCost) : null,
  };

  const inspectorRows: SyncedBudgetInspectorRow[] = rows.map((r) => ({
    id: r.id,
    groupName: r.groupName ?? null,
    itemName: r.itemName,
    costCode: r.costCode ?? null,
    costCodeName: r.costCodeName ?? null,
    costType: r.costType ?? null,
    unit: r.unit ?? null,
    quantity: r.quantity != null ? decimalToDisplay(r.quantity) : null,
    unitCost: r.unitCost != null ? decimalToDisplay(r.unitCost) : null,
    unitPrice: r.unitPrice != null ? decimalToDisplay(r.unitPrice) : null,
    extCost: decimalToDisplay(r.extCost),
    extSell: decimalToDisplay(r.extSell),
  }));

  return { summary, rows: inspectorRows };
}

// ---------------------------------------------------------------------------
// Dev-only: parse and sync pasted budget export text
// ---------------------------------------------------------------------------

export type ParseAndSyncBudgetTextResult =
  | {
      ok: true;
      jobId: string;
      rowCount: number;
      officialSell: string;
      officialCost: string;
      status: string;
    }
  | { ok: false; error: string };

/** Dev-only: parse DataX-style budget text and sync into canonical tables. Admin-only. */
export async function parseAndSyncBudgetTextAction(
  formData: FormData
): Promise<ParseAndSyncBudgetTextResult> {
  await requireAdmin();
  const budgetText = (formData.get("budgetText") as string)?.trim() ?? "";
  if (!budgetText) {
    return { ok: false, error: "Budget text is required." };
  }

  let budget;
  try {
    budget = parseBudgetExportText(budgetText);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to parse budget text.";
    return { ok: false, error: message };
  }

  if (!budget.jobId || !budget.jobName) {
    return { ok: false, error: "Parsed budget must have jobId and jobName (from Job: line)." };
  }
  if (!budget.items?.length) {
    return { ok: false, error: "Parsed budget must have at least one item row." };
  }

  const result = await syncNormalizedJobBudget(budget);
  if (result.status === "error") {
    return { ok: false, error: result.message ?? "Sync failed." };
  }

  revalidatePath("/admin/settings/integrations");
  return {
    ok: true,
    jobId: budget.jobId,
    rowCount: result.rowCount,
    officialSell: result.sellTotal.toFixed(2),
    officialCost: result.costTotal.toFixed(2),
    status: result.status,
  };
}

// ---------------------------------------------------------------------------
// Dev-only: parse and sync pasted budget JSON
// ---------------------------------------------------------------------------

export type ParseAndSyncBudgetJsonResult =
  | {
      ok: true;
      jobId: string;
      rowCount: number;
      officialSell: string;
      officialCost: string;
      status: string;
    }
  | { ok: false; error: string };

/** Dev-only: parse budget JSON and sync into canonical tables. Admin-only. */
export async function parseAndSyncBudgetJsonAction(
  formData: FormData
): Promise<ParseAndSyncBudgetJsonResult> {
  await requireAdmin();
  const budgetJsonRaw = (formData.get("budgetJson") as string)?.trim() ?? "";
  if (!budgetJsonRaw) {
    return { ok: false, error: "Budget JSON is required." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(budgetJsonRaw);
  } catch {
    return { ok: false, error: "Invalid JSON. Check syntax (e.g. quotes, commas, brackets)." };
  }

  const normalized = normalizeBudgetJson(parsed);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }
  const budget = normalized.budget;

  if (!budget.jobId || !budget.jobName) {
    return { ok: false, error: "Parsed budget must have jobId and jobName." };
  }
  if (!budget.items?.length) {
    return { ok: false, error: "Parsed budget must have at least one item row." };
  }

  const result = await syncNormalizedJobBudget(budget);
  if (result.status === "error") {
    return { ok: false, error: result.message ?? "Sync failed." };
  }

  revalidatePath("/admin/settings/integrations");
  return {
    ok: true,
    jobId: budget.jobId,
    rowCount: result.rowCount,
    officialSell: result.sellTotal.toFixed(2),
    officialCost: result.costTotal.toFixed(2),
    status: result.status,
  };
}

const PRICE_PER_SQ_FT_MAX = 5000;
const SECTION_TYPE_PRICE_MAX = 10_000_000;

function validatePricePerSqFt(value: number | null | undefined): { error?: string } {
  if (value === null || value === undefined) return {};
  if (typeof value !== "number" || Number.isNaN(value)) return { error: "Price must be a number" };
  if (value <= 0) return { error: "Price per sq ft must be greater than 0" };
  if (value >= PRICE_PER_SQ_FT_MAX) return { error: `Price per sq ft must be less than ${PRICE_PER_SQ_FT_MAX}` };
  return {};
}

/** Validate generic section type price (any basis). Do not treat blank as 0. */
function validateSectionTypePrice(value: number | null | undefined): { error?: string } {
  if (value === null || value === undefined) return {};
  if (typeof value !== "number" || Number.isNaN(value)) return { error: "Price must be a number" };
  if (value <= 0) return { error: "Price must be greater than 0" };
  if (value >= SECTION_TYPE_PRICE_MAX) return { error: `Price must be less than ${SECTION_TYPE_PRICE_MAX}` };
  return {};
}

function parseOptionalFloat(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(String(raw).trim());
  return Number.isNaN(n) ? null : n;
}

export async function getRoomTypes() {
  await requireAdmin();
  return prisma.roomType.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function addRoomTypeAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const name = (formData.get("name") as string)?.trim() ?? "";
  if (!name) return { error: "Name is required" };
  const exterior = formData.get("exterior") === "on" || formData.get("exterior") === "true";
  const pricePerSqFtTarget = parseOptionalFloat(formData, "pricePerSqFtTarget");
  const vTarget = validatePricePerSqFt(pricePerSqFtTarget);
  if (vTarget.error) return vTarget;
  const maxOrder = await prisma.roomType
    .aggregate({ _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.roomType.create({
    data: {
      name,
      sortOrder: maxOrder + 1,
      active: true,
      exterior,
      pricePerSqFtTarget: pricePerSqFtTarget ?? undefined,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function updateRoomTypeNameAction(
  roomTypeId: string,
  name: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { error: "Name is required" };
  await prisma.roomType.update({
    where: { id: roomTypeId },
    data: { name: trimmed },
  });
  revalidatePath("/admin/settings");
  return {};
}

export type UpdateRoomTypePricingData = {
  pricePerSqFtLow?: number | null;
  pricePerSqFtTarget?: number | null;
  pricePerSqFtHigh?: number | null;
};

/** Round low/high to whole dollars for storage. Low: floor, High: ceil. */
function roundLowForStorage(value: number): number {
  return Math.floor(value);
}
function roundHighForStorage(value: number): number {
  return Math.ceil(value);
}

/** Section type generic pricing: low round DOWN to 2 decimals, target round to 2, high round UP to 2. */
function roundSectionTypeLow(value: number): number {
  return Math.floor(value * 100) / 100;
}
function roundSectionTypeTarget(value: number): number {
  return Math.round(value * 100) / 100;
}
function roundSectionTypeHigh(value: number): number {
  return Math.ceil(value * 100) / 100;
}

const PRICING_BASIS_VALUES: PricingBasis[] = ["NONE", "PER_SF", "PER_EACH", "PER_JOB"];

export async function updateSectionTypePricingBasisAction(
  sectionTypeId: string,
  pricingBasis: string
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!PRICING_BASIS_VALUES.includes(pricingBasis as PricingBasis)) {
    return { error: "Invalid pricing basis" };
  }
  const existing = await prisma.sectionType.findUnique({
    where: { id: sectionTypeId },
    select: { id: true },
  });
  if (!existing) return { error: "Section type not found" };
  await prisma.sectionType.update({
    where: { id: sectionTypeId },
    data: { pricingBasis: pricingBasis as PricingBasis },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function updateRoomTypePricingAction(
  roomTypeId: string,
  data: UpdateRoomTypePricingData
): Promise<{ error?: string }> {
  await requireAdmin();
  let target: number | null | undefined = data.pricePerSqFtTarget;
  let low: number | null | undefined = data.pricePerSqFtLow;
  let high: number | null | undefined = data.pricePerSqFtHigh;

  if (target !== undefined && target !== null) {
    const vTarget = validatePricePerSqFt(target);
    if (vTarget.error) return vTarget;
    target = Math.round(target * 100) / 100;
  }
  if (low !== undefined && low !== null) {
    const vLow = validatePricePerSqFt(low);
    if (vLow.error) return vLow;
    low = roundLowForStorage(low);
  }
  if (high !== undefined && high !== null) {
    const vHigh = validatePricePerSqFt(high);
    if (vHigh.error) return vHigh;
    high = roundHighForStorage(high);
  }

  const existing = await prisma.roomType.findUnique({
    where: { id: roomTypeId },
    select: { pricePerSqFtLow: true, pricePerSqFtHigh: true },
  });
  const lowVal = low !== undefined ? low : (existing?.pricePerSqFtLow ?? undefined);
  const highVal = high !== undefined ? high : (existing?.pricePerSqFtHigh ?? undefined);
  if (lowVal != null && highVal != null && lowVal > highVal) {
    return { error: "Low must be less than or equal to High" };
  }

  await prisma.roomType.update({
    where: { id: roomTypeId },
    data: {
      ...(target !== undefined && { pricePerSqFtTarget: target ?? null }),
      ...(low !== undefined && { pricePerSqFtLow: low ?? null }),
      ...(high !== undefined && { pricePerSqFtHigh: high ?? null }),
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function deleteRoomTypeAction(roomTypeId: string): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.roomType.delete({ where: { id: roomTypeId } });
  revalidatePath("/admin/settings");
  return {};
}

export async function toggleRoomTypeActiveAction(
  roomTypeId: string,
  active: boolean
): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.roomType.update({
    where: { id: roomTypeId },
    data: { active },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function toggleRoomTypeExteriorAction(
  roomTypeId: string,
  exterior: boolean
): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.roomType.update({
    where: { id: roomTypeId },
    data: { exterior },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function reorderRoomTypeAction(
  roomTypeId: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  await requireAdmin();
  const roomTypes = await prisma.roomType.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const idx = roomTypes.findIndex((r) => r.id === roomTypeId);
  if (idx < 0) return { error: "Room type not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= roomTypes.length) return {};
  const a = roomTypes[idx]!;
  const b = roomTypes[swapIdx]!;
  await prisma.$transaction([
    prisma.roomType.update({
      where: { id: a.id },
      data: { sortOrder: b.sortOrder },
    }),
    prisma.roomType.update({
      where: { id: b.id },
      data: { sortOrder: a.sortOrder },
    }),
  ]);
  revalidatePath("/admin/settings");
  return {};
}

/** Persist new order of room types by ID. sortOrder = 1-based index. */
export async function reorderRoomTypes(
  idsInNewOrder: string[]
): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.$transaction(
    idsInNewOrder.map((id, index) =>
      prisma.roomType.update({
        where: { id },
        data: { sortOrder: index + 1 },
      })
    )
  );
  revalidatePath("/admin/settings");
  return {};
}

// ——— Employees ———

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmployeeInput(data: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): { error?: string } {
  const firstName = (data.firstName ?? "").trim();
  const lastName = (data.lastName ?? "").trim();
  if (!firstName) return { error: "First name is required" };
  if (!lastName) return { error: "Last name is required" };
  const email = (data.email ?? "").trim();
  if (email && !EMAIL_REGEX.test(email)) return { error: "Invalid email format" };
  return {};
}

export async function listEmployees() {
  await requireAdmin();
  return prisma.employee.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

export type CreateEmployeeData = {
  firstName: string;
  lastName: string;
  roleTitle?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function createEmployee(
  data: CreateEmployeeData
): Promise<{ error?: string }> {
  await requireAdmin();
  const err = validateEmployeeInput(data);
  if (err.error) return err;
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const email = (data.email ?? "").trim() || null;
  const roleTitle = (data.roleTitle ?? "").trim() || null;
  const phone = (data.phone ?? "").trim() || null;
  if (email) {
    const existing = await prisma.employee.findUnique({ where: { email } });
    if (existing) return { error: "An employee with this email already exists" };
  }
  const maxOrder = await prisma.employee
    .aggregate({ _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.employee.create({
    data: {
      firstName,
      lastName,
      roleTitle,
      email,
      phone,
      sortOrder: maxOrder + 1,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export type UpdateEmployeeData = {
  firstName?: string;
  lastName?: string;
  roleTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  // Signature fields (Cleanup G). Undefined = leave unchanged; null/"" = clear.
  headshotUrl?: string | null;
  jobTitle?: string | null;
  signatureQuote?: string | null;
  directPhone?: string | null;
  mobilePhone?: string | null;
  linkedInUrl?: string | null;
  signatureEnabled?: boolean;
};

/**
 * Apply a patch to an Employee record. Fields left `undefined` in `data`
 * preserve their existing values; fields passed as `null` or empty string
 * clear the column (except for firstName/lastName which are required).
 */
export async function updateEmployee(
  id: string,
  data: UpdateEmployeeData
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return { error: "Employee not found" };
  const firstName = (data.firstName ?? existing.firstName).trim();
  const lastName = (data.lastName ?? existing.lastName).trim();
  const email = (data.email ?? existing.email ?? "").trim() || null;
  const roleTitle = (data.roleTitle ?? existing.roleTitle ?? "").trim() || null;
  const phone = (data.phone ?? existing.phone ?? "").trim() || null;
  const err = validateEmployeeInput({ firstName, lastName, email });
  if (err.error) return err;
  if (email) {
    const duplicate = await prisma.employee.findFirst({
      where: { email, id: { not: id } },
    });
    if (duplicate) return { error: "An employee with this email already exists" };
  }

  // Signature fields — only apply when the caller passed a value. `null` and
  // `""` both mean clear; anything else is trim-and-store.
  const sigPatch: Record<string, string | boolean | null> = {};
  if (data.headshotUrl !== undefined) {
    sigPatch.headshotUrl = (data.headshotUrl ?? "").trim() || null;
  }
  if (data.jobTitle !== undefined) {
    sigPatch.jobTitle = (data.jobTitle ?? "").trim() || null;
  }
  if (data.signatureQuote !== undefined) {
    sigPatch.signatureQuote = (data.signatureQuote ?? "").trim() || null;
  }
  if (data.directPhone !== undefined) {
    sigPatch.directPhone = (data.directPhone ?? "").trim() || null;
  }
  if (data.mobilePhone !== undefined) {
    sigPatch.mobilePhone = (data.mobilePhone ?? "").trim() || null;
  }
  if (data.linkedInUrl !== undefined) {
    sigPatch.linkedInUrl = (data.linkedInUrl ?? "").trim() || null;
  }
  if (data.signatureEnabled !== undefined) {
    sigPatch.signatureEnabled = data.signatureEnabled;
  }

  await prisma.employee.update({
    where: { id },
    data: { firstName, lastName, roleTitle, email, phone, ...sigPatch },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function toggleEmployeeActive(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const emp = await prisma.employee.findUnique({ where: { id } });
  if (!emp) return { error: "Employee not found" };
  await prisma.employee.update({
    where: { id },
    data: { isActive: !emp.isActive },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function deleteEmployee(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.employee.delete({ where: { id } });
  revalidatePath("/admin/settings");
  return {};
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Only admins may call. Prevents changing Super Admin; prevents removing admin if it would leave zero admins. */
export async function toggleEmployeeAdmin(
  employeeId: string,
  isAdmin: boolean
): Promise<{ error?: string }> {
  const { email: currentEmail } = await requireAdmin();

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return { error: "Employee not found" };

  const employeeEmailLower = (employee.email ?? "").toLowerCase();
  if (employeeEmailLower === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return { error: "Cannot change Super Admin." };
  }

  if (employee.isAdmin === isAdmin) return {}; // no-op

  if (!isAdmin) {
    const employeeAdminCount = await prisma.employee.count({ where: { isAdmin: true } });
    const bootstrapAdminCount = parseCsv(process.env.ADMIN_EMAILS).length;
    const superAdminCount = 1; // Super Admin always passes requireAdmin() regardless of Employee
    const remainingAdmins = (employeeAdminCount - 1) + bootstrapAdminCount + superAdminCount;
    if (remainingAdmins < 1) {
      return { error: "Cannot remove the last admin. At least one admin is required." };
    }
    const isSelfDemotion = employeeEmailLower === (currentEmail ?? "");
    if (isSelfDemotion && employeeAdminCount <= 1 && bootstrapAdminCount === 0) {
      return { error: "Cannot remove your own admin rights while you are the only employee admin." };
    }
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: { isAdmin },
  });
  revalidatePath("/admin/settings");
  return {};
}

// ——— Style Presets ———

/** All presets for Settings tab (table): order by sortOrder. */
export async function listStylePresets() {
  await requireAdmin();
  return prisma.stylePreset.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Active presets only, for dropdowns (project default, room override, per-render): order by sortOrder. */
export async function listActiveStylePresets() {
  await requireAdmin();
  return prisma.stylePreset.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export type CreateStylePresetData = {
  name: string;
  prompt: string;
  isActive?: boolean;
  sortOrder?: number;
};

export async function createStylePreset(
  data: CreateStylePresetData
): Promise<{ error?: string }> {
  await requireAdmin();
  const name = (data.name ?? "").trim();
  const prompt = (data.prompt ?? "").trim();
  if (!name) return { error: "Name is required" };
  if (!prompt) return { error: "Prompt is required" };
  const existing = await prisma.stylePreset.findUnique({ where: { name } });
  if (existing) return { error: "A preset with this name already exists" };
  const maxOrder = await prisma.stylePreset
    .aggregate({ _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.stylePreset.create({
    data: {
      name,
      prompt,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? maxOrder + 10,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export type UpdateStylePresetData = {
  name?: string;
  prompt?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export async function updateStylePreset(
  id: string,
  data: UpdateStylePresetData
): Promise<{ error?: string }> {
  await requireAdmin();
  const preset = await prisma.stylePreset.findUnique({ where: { id } });
  if (!preset) return { error: "Style preset not found" };
  const name = data.name !== undefined ? (data.name ?? "").trim() : undefined;
  const prompt = data.prompt !== undefined ? (data.prompt ?? "").trim() : undefined;
  if (name !== undefined && !name) return { error: "Name is required" };
  if (prompt !== undefined && !prompt) return { error: "Prompt is required" };
  if (name !== undefined && name !== preset.name) {
    const existing = await prisma.stylePreset.findUnique({ where: { name } });
    if (existing) return { error: "A preset with this name already exists" };
  }
  await prisma.stylePreset.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(prompt !== undefined && { prompt }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function deleteStylePreset(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const preset = await prisma.stylePreset.findUnique({ where: { id } });
  if (!preset) return { error: "Style preset not found" };
  // Set FKs to null and allow delete (safer option per spec)
  await prisma.$transaction([
    prisma.project.updateMany({ where: { stylePresetId: id }, data: { stylePresetId: null } }),
    prisma.room.updateMany({ where: { stylePresetId: id }, data: { stylePresetId: null } }),
    prisma.media.updateMany({ where: { stylePresetId: id }, data: { stylePresetId: null } }),
    prisma.stylePreset.delete({ where: { id } }),
  ]);
  revalidatePath("/admin/settings");
  return {};
}

export async function reorderStylePreset(
  id: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  await requireAdmin();
  const presets = await prisma.stylePreset.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, sortOrder: true },
  });
  const idx = presets.findIndex((p) => p.id === id);
  if (idx < 0) return { error: "Style preset not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= presets.length) return {};
  const a = presets[idx]!;
  const b = presets[swapIdx]!;
  await prisma.$transaction([
    prisma.stylePreset.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.stylePreset.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);
  revalidatePath("/admin/settings");
  return {};
}

/** Set order of style presets by passing ids in desired order. sortOrder = 1-based index. */
export async function reorderStylePresets(
  orderedIds: string[]
): Promise<{ error?: string }> {
  await requireAdmin();
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.stylePreset.update({
        where: { id },
        data: { sortOrder: index + 1 },
      })
    )
  );
  revalidatePath("/admin/settings");
  return {};
}

/** Prevent deactivating the last active preset. */
export async function toggleStylePresetActive(
  id: string,
  isActive: boolean
): Promise<{ error?: string }> {
  await requireAdmin();
  const preset = await prisma.stylePreset.findUnique({ where: { id } });
  if (!preset) return { error: "Style preset not found" };
  if (isActive) {
    await prisma.stylePreset.update({ where: { id }, data: { isActive: true } });
    revalidatePath("/admin/settings");
    return {};
  }
  const activeCount = await prisma.stylePreset.count({ where: { isActive: true } });
  if (activeCount <= 1) {
    return { error: "At least one active preset is required. Add another preset first, then deactivate this one." };
  }
  await prisma.stylePreset.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/admin/settings");
  return {};
}

// ——— Section Types ———

export async function listSectionTypes() {
  await requireAdmin();
  return prisma.sectionType.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export type CreateSectionTypeData = {
  name: string;
  category: SectionCategory;
  defaultMeasurementMode: MeasurementMode;
  defaultEstimateUnit: EstimateUnit;
  customUnitLabel?: string | null;
};

export async function createSectionType(
  data: CreateSectionTypeData
): Promise<{ error?: string }> {
  await requireAdmin();
  const name = (data.name ?? "").trim();
  if (!name) return { error: "Name is required" };
  if (data.defaultEstimateUnit === "CUSTOM") {
    const label = (data.customUnitLabel ?? "").trim();
    if (!label) return { error: "Custom unit label is required when estimate unit is CUSTOM" };
  }
  const existing = await prisma.sectionType.findUnique({ where: { name } });
  if (existing) return { error: "A section type with this name already exists" };
  await prisma.sectionType.create({
    data: {
      name,
      category: data.category,
      defaultMeasurementMode: data.defaultMeasurementMode,
      defaultEstimateUnit: data.defaultEstimateUnit,
      customUnitLabel: data.defaultEstimateUnit === "CUSTOM" ? (data.customUnitLabel ?? "").trim() || null : null,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export type UpdateSectionTypeData = {
  name?: string;
  category?: SectionCategory;
  defaultMeasurementMode?: MeasurementMode;
  defaultEstimateUnit?: EstimateUnit;
  customUnitLabel?: string | null;
};

export async function updateSectionType(
  id: string,
  data: UpdateSectionTypeData
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.sectionType.findUnique({ where: { id } });
  if (!existing) return { error: "Section type not found" };
  const name = data.name !== undefined ? (data.name ?? "").trim() : undefined;
  if (name !== undefined && !name) return { error: "Name is required" };
  const unit = data.defaultEstimateUnit !== undefined ? data.defaultEstimateUnit : existing.defaultEstimateUnit;
  const labelRaw = data.customUnitLabel !== undefined ? data.customUnitLabel : existing.customUnitLabel;
  const label = (labelRaw ?? "").trim() || null;
  if (unit === "CUSTOM" && !label) {
    return { error: "Custom unit label is required when estimate unit is CUSTOM" };
  }
  if (name !== undefined && name !== existing.name) {
    const duplicate = await prisma.sectionType.findUnique({ where: { name } });
    if (duplicate) return { error: "A section type with this name already exists" };
  }
  await prisma.sectionType.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.defaultMeasurementMode !== undefined && { defaultMeasurementMode: data.defaultMeasurementMode }),
      ...(data.defaultEstimateUnit !== undefined && { defaultEstimateUnit: data.defaultEstimateUnit }),
      customUnitLabel: unit === "CUSTOM" ? label : null,
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

export async function deleteSectionType(
  id: string,
  reassignSectionTypeId?: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const st = await prisma.sectionType.findUnique({ where: { id } });
  if (!st) return { error: "Section type not found" };
  if (reassignSectionTypeId) {
    if (reassignSectionTypeId === id) {
      return { error: "Cannot reassign to the same Pricing Profile." };
    }
    const target = await prisma.sectionType.findUnique({
      where: { id: reassignSectionTypeId },
      select: { id: true },
    });
    if (!target) return { error: "Replacement Pricing Profile not found." };
  }
  await prisma.$transaction([
    prisma.room.updateMany({
      where: { sectionTypeId: id },
      data: { sectionTypeId: reassignSectionTypeId ?? null },
    }),
    prisma.sectionType.delete({ where: { id } }),
  ]);
  revalidatePath("/admin/settings");
  return {};
}

export type UpdateSectionTypePricingData = {
  priceLow?: number | null;
  priceTarget?: number | null;
  priceHigh?: number | null;
};

/** Update generic pricing for a SectionType. Accepts number > 0, null (clear), or undefined (don't touch).
 * Rounding: low down to 2 decimals, target to 2, high up to 2. Never coerce blank to 0. */
export async function updateSectionTypePricingAction(
  sectionTypeId: string,
  data: UpdateSectionTypePricingData
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.sectionType.findUnique({
    where: { id: sectionTypeId },
    select: { priceLow: true, priceTarget: true, priceHigh: true },
  });
  if (!existing) return { error: "Section type not found" };

  let target: number | null | undefined = data.priceTarget;
  let low: number | null | undefined = data.priceLow;
  let high: number | null | undefined = data.priceHigh;

  if (target !== undefined && target !== null) {
    const vTarget = validateSectionTypePrice(target);
    if (vTarget.error) return vTarget;
    target = roundSectionTypeTarget(target);
  }
  if (low !== undefined && low !== null) {
    const vLow = validateSectionTypePrice(low);
    if (vLow.error) return vLow;
    low = roundSectionTypeLow(low);
  }
  if (high !== undefined && high !== null) {
    const vHigh = validateSectionTypePrice(high);
    if (vHigh.error) return vHigh;
    high = roundSectionTypeHigh(high);
  }

  const lowVal = low !== undefined ? low : (existing.priceLow ?? undefined);
  const highVal = high !== undefined ? high : (existing.priceHigh ?? undefined);
  if (lowVal != null && highVal != null && lowVal > highVal) {
    return { error: "Low must be less than or equal to High" };
  }

  await prisma.sectionType.update({
    where: { id: sectionTypeId },
    data: {
      ...(target !== undefined && { priceTarget: target }),
      ...(low !== undefined && { priceLow: low }),
      ...(high !== undefined && { priceHigh: high }),
    },
  });
  revalidatePath("/admin/settings");
  return {};
}

/** Recompute display only: does NOT write priceLow/priceHigh to DB. PER_SF Low/High are computed from Target + % in UI; overrides are explicit only. */
export async function recomputeSectionTypeLowHighForOneAction(
  sectionTypeId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  // No DB writes: computed values must not be materialized. Display is computed client-side when priceLow/priceHigh are null.
  revalidatePath("/admin/settings");
  return {};
}

/** Recompute display only: does NOT write priceLow/priceHigh to DB. PER_SF Low/High are computed from Target + % in UI; overrides are explicit only. */
export async function recomputeSectionTypeLowHighAction(): Promise<{ error?: string }> {
  await requireAdmin();
  // No DB writes: computed values must not be materialized. Display is computed client-side when priceLow/priceHigh are null.
  revalidatePath("/admin/settings");
  return {};
}

const CLEANUP_OVERRIDE_TOLERANCE = 0.01;

/** One-time cleanup: for PER_SF section types, set priceLow/priceHigh to null when they match computed values (within tolerance). Returns number of rows updated. */
export async function cleanupSectionTypeComputedOverridesAction(): Promise<
  { error?: string; cleaned?: number }
> {
  await requireAdmin();
  const settings = await prisma.companySettings.findFirst();
  const lowPct = settings?.roomTypeLowPct ?? DEFAULT_ROOM_TYPE_LOW_PCT;
  const highPct = settings?.roomTypeHighPct ?? DEFAULT_ROOM_TYPE_HIGH_PCT;

  const sectionTypes = await prisma.sectionType.findMany({
    where: { pricingBasis: "PER_SF", priceTarget: { not: null } },
    select: {
      id: true,
      priceTarget: true,
      priceLow: true,
      priceHigh: true,
    },
  });

  let cleaned = 0;
  const updates: Array<{ id: string; priceLow?: number | null; priceHigh?: number | null }> = [];

  for (const st of sectionTypes) {
    const target = st.priceTarget!;
    const expectedLow = roundSectionTypeLow(target * (1 + lowPct / 100));
    const expectedHigh = roundSectionTypeHigh(target * (1 + highPct / 100));
    const clearLow =
      st.priceLow != null &&
      Math.abs(st.priceLow - expectedLow) <= CLEANUP_OVERRIDE_TOLERANCE;
    const clearHigh =
      st.priceHigh != null &&
      Math.abs(st.priceHigh - expectedHigh) <= CLEANUP_OVERRIDE_TOLERANCE;
    if (clearLow || clearHigh) {
      updates.push({
        id: st.id,
        ...(clearLow && { priceLow: null }),
        ...(clearHigh && { priceHigh: null }),
      });
      cleaned += 1;
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.sectionType.update({
          where: { id: u.id },
          data: {
            ...(u.priceLow !== undefined && { priceLow: u.priceLow }),
            ...(u.priceHigh !== undefined && { priceHigh: u.priceHigh }),
          },
        })
      )
    );
  }
  revalidatePath("/admin/settings");
  return { cleaned };
}

/** One-time seed of HHI default section types. Only Super Admin can run. Does not duplicate existing names. */
export async function seedSectionTypesAction(): Promise<{ error?: string; inserted?: number }> {
  const { email } = await requireAdmin();
  if (email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
    return { error: "Only the Super Admin can run the section types seed." };
  }

  type SeedRow = {
    name: string;
    category: SectionCategory;
    defaultMeasurementMode: MeasurementMode;
    defaultEstimateUnit: EstimateUnit;
    customUnitLabel: string | null;
  };

  const defaults: SeedRow[] = [
    { name: "Kitchen", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Bathroom", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Bedroom", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Living Room", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Dining", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Hallway", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Laundry", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Pantry", category: "INTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Deck", category: "EXTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Screened Porch", category: "EXTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Exterior Paint", category: "EXTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Roof", category: "EXTERIOR", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SQ", customUnitLabel: null },
    { name: "Landscaping", category: "EXTERIOR", defaultMeasurementMode: "NONE", defaultEstimateUnit: "CUSTOM", customUnitLabel: "Job" },
    { name: "Water Heater", category: "SYSTEMS", defaultMeasurementMode: "COUNT", defaultEstimateUnit: "EA", customUnitLabel: null },
    { name: "HVAC", category: "SYSTEMS", defaultMeasurementMode: "COUNT", defaultEstimateUnit: "EA", customUnitLabel: null },
    { name: "Electrical", category: "SYSTEMS", defaultMeasurementMode: "NONE", defaultEstimateUnit: "CUSTOM", customUnitLabel: "Job" },
    { name: "Plumbing", category: "SYSTEMS", defaultMeasurementMode: "NONE", defaultEstimateUnit: "CUSTOM", customUnitLabel: "Job" },
    { name: "Whole-Home Interior", category: "WHOLE_HOME", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Whole-Home Remodel", category: "WHOLE_HOME", defaultMeasurementMode: "NONE", defaultEstimateUnit: "CUSTOM", customUnitLabel: "Job" },
    { name: "Addition", category: "ADDITION", defaultMeasurementMode: "AREA", defaultEstimateUnit: "SF", customUnitLabel: null },
    { name: "Replace Faucet", category: "FAST", defaultMeasurementMode: "COUNT", defaultEstimateUnit: "EA", customUnitLabel: null },
    { name: "Replace Toilet", category: "FAST", defaultMeasurementMode: "COUNT", defaultEstimateUnit: "EA", customUnitLabel: null },
    { name: "Replace Water Heater", category: "FAST", defaultMeasurementMode: "COUNT", defaultEstimateUnit: "EA", customUnitLabel: null },
    { name: "Patch Drywall", category: "FAST", defaultMeasurementMode: "NONE", defaultEstimateUnit: "CUSTOM", customUnitLabel: "Job" },
  ];

  const existingNames = new Set(
    (await prisma.sectionType.findMany({ select: { name: true } })).map((r) => r.name)
  );
  let inserted = 0;
  for (const row of defaults) {
    if (existingNames.has(row.name)) continue;
    await prisma.sectionType.create({
      data: {
        name: row.name,
        category: row.category,
        defaultMeasurementMode: row.defaultMeasurementMode,
        defaultEstimateUnit: row.defaultEstimateUnit,
        customUnitLabel: row.customUnitLabel,
      },
    });
    existingNames.add(row.name);
    inserted++;
  }
  revalidatePath("/admin/settings");
  return { inserted };
}

// ——— Brand Icons ———

import { getGeminiApiKey as _getGeminiApiKey } from "@/app/integrations/gemini";
import { getGeminiImageModel as _getGeminiImageModel } from "@/app/lib/ai/gemini-models";
const BRAND_ICON_NORMALIZED_SIZE = 256;

async function normalizeAndValidateIconPng(
  buffer: Buffer
): Promise<{ error?: string; normalizedBuffer?: Buffer }> {
  let png: Buffer;
  try {
    png = await sharp(buffer, { failOnError: true })
      .ensureAlpha()
      .resize(BRAND_ICON_NORMALIZED_SIZE, BRAND_ICON_NORMALIZED_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    return { error: "Icon must be a PNG with a transparent background." };
  }

  try {
    const result = await sharp(png)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .raw()
      .toBuffer({ resolveWithObject: true } as any);
    const { data, info } = result as unknown as {
      data: Buffer;
      info: { channels?: number };
    };
    const channels = info.channels ?? 0;
    if (channels < 4) {
      return { error: "Icon must be a PNG with a transparent background." };
    }
    let hasTransparentPixel = false;
    for (let i = 3; i < data.length; i += channels) {
      if (data[i] < 255) {
        hasTransparentPixel = true;
        break;
      }
    }
    if (!hasTransparentPixel) {
      return { error: "Icon must be a PNG with a transparent background." };
    }
  } catch {
    return { error: "Icon must be a PNG with a transparent background." };
  }

  return { normalizedBuffer: png };
}

async function normalizeIconPngFromAi(
  buffer: Buffer
): Promise<Buffer> {
  let png: Buffer;
  try {
    png = await sharp(buffer, { failOnError: true })
      .ensureAlpha()
      .png()
      .toBuffer();
  } catch {
    // If we cannot decode/process the image at all, surface a clear error.
    throw new Error("Failed to process AI-generated icon image.");
  }

  try {
    const result = await sharp(png)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .raw()
      .toBuffer({ resolveWithObject: true } as any);

    const { data, info } = result as unknown as {
      data: Buffer;
      info: { width: number; height: number; channels?: 1 | 2 | 3 | 4 };
    };

    const channels = (info.channels ?? 4) as 1 | 2 | 3 | 4;
    // We expect RGBA here because of ensureAlpha(), but if not, just return the basic PNG.
    if (channels < 4) {
      return png;
    }

    // Treat near-white pixels as background and key them out to full transparency.
    // This assumes the model followed the prompt and used a solid white background.
    const threshold = 252; // 0–255, how close to pure white (#FFFFFF) we consider "background"

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r >= threshold && g >= threshold && b >= threshold) {
        // Set alpha to 0 for background pixels, leave icon pixels untouched.
        data[i + 3] = 0;
      }
    }

    const output = await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels,
      },
    })
      .resize(BRAND_ICON_NORMALIZED_SIZE, BRAND_ICON_NORMALIZED_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    return output;
  } catch {
    // If keying fails for any reason, fall back to the basic PNG.
    return png;
  }
}

export type BrandIconSuggestion = {
  name: string;
  slug: string;
  category: string;
  tags: string[];
  description: string;
  visual: string;
};

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function getGeminiTextClient() {
  const apiKey = await _getGeminiApiKey();
  if (!apiKey?.trim()) {
    throw new Error("Gemini API key not configured. Add it in Settings > Integrations.");
  }
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

export async function suggestBrandIconsAction(
  input: {
    companyName?: string | null;
    websiteUrl?: string | null;
    description?: string | null;
    existingKeys?: string[] | null;
  }
): Promise<{ error?: string; suggestions?: BrandIconSuggestion[] }> {
  await requireAdmin();

  const companyName = (input.companyName ?? "").trim();
  const websiteUrl = (input.websiteUrl ?? "").trim();
  const description = (input.description ?? "").trim();
  const existingKeysInput = Array.isArray(input.existingKeys)
    ? input.existingKeys
    : [];

  const existingKeySet = new Set(
    existingKeysInput
      .map((k) => normalizeIconKey(k))
      .filter((k) => k.length > 0)
  );

  let ai: GoogleGenAI;
  try {
    ai = await getGeminiTextClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }

  const contextLines: string[] = [];
  if (companyName) contextLines.push(`Company name: ${companyName}`);
  if (websiteUrl) contextLines.push(`Website URL: ${websiteUrl}`);
  if (description) contextLines.push(`Company description: ${description}`);

  const prompt = `
You are helping a residential design-build-remodel company create a small SVG icon library for use in proposal documents and UI.

Business context:
${contextLines.join("\n") || "Design-build-remodel contractor focused on residential projects."}

Task:
Suggest between 10 and 12 concrete, re-usable icon concepts that match a remodeler/proposal workflow. Icons must be easy to draw as a clean 24px stroke icon (Lucide-style).

Icon theming requirements:
- Avoid abstract ideas like "impact", "exceptionality", "momentum", "value", "experience".
- Focus ONLY on objects and moments that are clearly drawable:
  - Services: kitchen, bath, addition, exterior, deck, landscaping, paint, tile, cabinetry, plumbing, electrical, HVAC.
  - Process: design, estimate, schedule, selections, permits, demo, build, punch list, completion.
  - Client experience: communication, approvals, warranty, quality check, transparency.
  - Documents: contract, checklist, invoice, plan set.

Output format:
Return ONLY a JSON array (no prose, no markdown fences) with 10–12 items. Each item must have this exact shape:
[
  {
    "name": "Kitchen Remodel",
    "slug": "kitchen-remodel",
    "category": "services",
    "tags": ["kitchen", "remodel", "cabinets"],
    "description": "Shows a simple kitchen scene such as a base cabinet, upper cabinet, and small appliance outline.",
    "visual": "simple kitchen base cabinet and upper cabinet with small stove outline"
  }
]

Field rules:
- name: short, human-friendly label.
- slug: kebab-case, lowercase, using only letters, numbers, and dashes.
- category: ONE of exactly four values: "services", "process", "documents", "experience".
- tags: 3–6 short, lowercase keywords directly related to remodeler work (e.g. "kitchen", "bathroom", "estimate", "schedule", "contract").
- description: ONE short sentence describing what the icon should visually depict (not abstract value props).
- visual: a very short, concrete visual directive that is easy to draw as a line icon; focus on clear shapes and accents, e.g. "house outline with small pencil accent", "document outline with checkmark accent", "tile grid with one highlighted square".

Hard constraints:
- Do NOT include any text outside the JSON array.
- Do NOT include markdown code fences.
- Do NOT use abstract concepts that cannot be drawn as simple objects or scenes.
- You MUST treat two icons as duplicates if their normalized key matches. The normalized key is computed as:
  - lowercased
  - trimmed
  - "&" replaced with "and"
  - all punctuation removed
  - whitespace collapsed to single "-"
- You MUST NOT propose any icon whose normalized key is in this list of reserved keys:
  ${Array.from(existingKeySet)
    .slice(0, 200)
    .join(", ")}
`.trim();

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: await _getGeminiImageModel(),
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      config: {
        responseModalities: ["TEXT"],
      },
    });
  } catch (e) {
    const anyErr = e as { status?: unknown; message?: unknown };
    const status = anyErr?.status;
    const message = (anyErr?.message ?? String(e)) as string;
    const isNotFound =
      status === 404 ||
      status === "NOT_FOUND" ||
      /NOT_FOUND/.test(message) ||
      /404/.test(message);
    if (isNotFound) {
      return {
        error:
          "Gemini model not available. Check model selection in Settings > Integrations.",
      };
    }
    return { error: `Gemini suggestion request failed: ${message}` };
  }

  const candidates = (response as { candidates?: unknown[] })?.candidates;
  const parts = (candidates?.[0] as { content?: { parts?: { text?: string }[] } })?.content?.parts;
  const textPart = parts?.find(
    (p): p is { text: string } => typeof (p as { text?: string }).text === "string"
  );
  const raw = textPart?.text?.trim() ?? "";
  if (!raw) {
    return { error: "Gemini returned an empty response for icon suggestions." };
  }

  // Strip common markdown fences or leading text if present.
  const cleaned = raw
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const parsed = safeJsonParse<BrandIconSuggestion[] | { icons?: BrandIconSuggestion[] }>(cleaned);
  if (!parsed) {
    return {
      error:
        "Failed to parse Gemini response as JSON. Try again or simplify the company description.",
    };
  }

  const suggestionsArray = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.icons)
      ? parsed.icons
      : null;

  if (!suggestionsArray || suggestionsArray.length === 0) {
    return { error: "Gemini did not return any icon suggestions." };
  }

  const ALLOWED_CATEGORIES = new Set(["services", "process", "documents", "experience"]);

  const suggestions: BrandIconSuggestion[] = suggestionsArray
    .map((item) => {
      const name = (item.name ?? "").toString().trim();
      const slug = (item.slug ?? "").toString().trim();
      const rawCategory = (item.category ?? "").toString().trim().toLowerCase();
      const tags = Array.isArray(item.tags)
        ? item.tags.map((t) => (t ?? "").toString().trim().toLowerCase()).filter(Boolean)
        : [];
      const description = (item.description ?? "").toString().trim();
      const visual = (item.visual ?? "").toString().trim();

      let category = rawCategory;
      if (!ALLOWED_CATEGORIES.has(category)) {
        if (rawCategory.startsWith("service")) category = "services";
        else if (rawCategory.startsWith("doc")) category = "documents";
        else if (rawCategory.includes("client") || rawCategory.includes("experience")) {
          category = "experience";
        } else if (rawCategory.includes("process") || rawCategory.includes("workflow")) {
          category = "process";
        }
      }
      if (!ALLOWED_CATEGORIES.has(category)) {
        // Default ambiguous categories to "services" since most icons are service-like.
        category = "services";
      }

      const normalizedTags = tags.slice(0, 6);
      while (normalizedTags.length < 3 && normalizedTags.length > 0) {
        normalizedTags.push(normalizedTags[normalizedTags.length - 1]!);
      }

      return {
        name,
        slug,
        category,
        tags: normalizedTags,
        description,
        visual,
      } satisfies BrandIconSuggestion;
    })
    .filter((s) => s.name && s.slug && s.visual);

  if (suggestions.length === 0) {
    return { error: "Gemini suggestions could not be normalized into usable icon ideas." };
  }

  // Server-side dedupe: remove anything that collides with existing keys,
  // and ensure no duplicates within this batch (by normalized key).
  const seen = new Set(existingKeySet);
  const deduped: BrandIconSuggestion[] = [];
  for (const s of suggestions) {
    const key = normalizeIconKey(s.slug ?? s.name ?? "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }

  if (deduped.length === 0) {
    return {
      error:
        "Gemini suggestions were filtered out as duplicates of existing icons. Try again with a different description or after clearing some icons.",
    };
  }

  return { suggestions: deduped };
}

export async function generateBrandIconPngAction(
  input: { name: string; visual: string; description?: string | null }
): Promise<{ error?: string; imageUrl?: string; imageKey?: string; width?: number; height?: number }> {
  await requireAdmin();

  const { effectiveAccent, effectiveText } = await getEffectiveBrandColors();

  const name = (input.name ?? "").toString().trim();
  const visual = (input.visual ?? "").toString().trim();
  const description = (input.description ?? "").toString().trim();

  if (!name) {
    return { error: "Name is required for PNG generation." };
  }
  if (!visual) {
    return { error: "Visual directive is required for PNG generation." };
  }

  const geminiKey = await _getGeminiApiKey();
  if (!geminiKey?.trim()) {
    return { error: "Gemini API key not configured. Add it in Settings > Integrations." };
  }

  const ai = new GoogleGenAI({ apiKey: geminiKey.trim() });

  const prompt = `
You are designing a single clean, modern PNG icon for a design-build-remodel company.

Icon name: ${name}
Primary visual directive: ${visual}
Additional context: ${description || "Simple, clear icon for a home services contractor."}

ICON OUTPUT REQUIREMENTS (STRICT, MUST FOLLOW EXACTLY):
- Output exactly ONE icon image, not a sheet or grid.
- The output format SHOULD be a PNG image (no animated formats like GIF or APNG).
- The canvas must be a 1:1 square (for example 512x512).
- The BACKGROUND must be a SOLID pure white color (#FFFFFF) with no gradient, no noise, no texture, and no pattern.
- Absolutely NO fake-transparency checkerboards, grids, tiles, or crosshatch patterns in the background.
- Do NOT use gradient, textured, photographic, or patterned backgrounds of any kind.
- Do NOT include drop shadows, inner shadows, outer glows, halos, or cast shadows around or behind the icon.
- The icon must be a standalone subject on this solid white canvas only. Do NOT add a separate plate, tile, badge, circle, rounded rectangle, frame, or container shape behind it.
- Only use visible strokes and filled shapes for the subject itself.
- The icon subject must be centered on the canvas with even padding on all sides so strokes never touch the canvas edge.
- Line-art inspired style: simple, clean outlines, with optional subtle flat fills.

PALETTE:
- Full color is allowed. You may use multiple colors for the icon details.
- Prefer a cohesive, professional palette that would look good on both light and dark UI backgrounds.
- Avoid neon, extremely saturated, or visually noisy palettes.
- No photographic textures or photo-like elements.

ADDITIONAL HARD CONSTRAINTS:
- No text, no letters, no words.
- No drop shadows, outer glows, inner glows, halos, or lighting effects that look like a shadow or glow around the icon.
- No gradient BACKGROUND or gradient plate behind the icon. If you use gradients, they must be inside the icon subject only (not covering the canvas).
- No people or faces; focus on tools, documents, rooms, or process scenes.
- Keep the icon centered with comfortable padding to all edges so strokes never touch the canvas edge.

Style:
- Simple and bold enough to be legible at 24px in UI.

Output:
- Return a single PNG image that follows ALL of the above rules.
`.trim();

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: await _getGeminiImageModel(),
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Gemini image request failed: ${msg}` };
  }

  const candidates = (response as { candidates?: unknown[] })?.candidates;
  const parts = (candidates?.[0] as { content?: { parts?: unknown[] } })?.content?.parts;
  if (!parts?.length) {
    return { error: "Gemini returned no image content for icon generation." };
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
    return { error: "Gemini returned no inline image data for icon generation." };
  }

  const bytes = Buffer.from(imageBase64, "base64");
  let processedPng: Buffer;
  try {
    processedPng = await normalizeIconPngFromAi(bytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Failed to post-process AI icon PNG: ${msg}` };
  }

  const objectKey = `brand-icons/global/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.png`;

  try {
    const { publicUrl, fileKey } = await uploadBuffer(
      objectKey,
      processedPng,
      "image/png"
    );
    return {
      imageUrl: publicUrl,
      imageKey: fileKey,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Failed to upload icon PNG to storage: ${msg}` };
  }
}

/** Stub for AI-generated background textures. Returns not-implemented until backend is wired. */
export async function generateBackgroundTextureAction(input: {
  prompt: string;
  type: "subtle_texture" | "icon_pattern" | "gradient_texture";
}): Promise<{ error?: string; images?: { imageUrl: string; imageKey: string }[] }> {
  await requireAdmin();
  void input;
  return {
    error: "Generate Background (Gemini) is not implemented yet. Backend will be wired later.",
  };
}

export type BrandIconCreateData = {
  slug: string;
  name: string;
  imageUrl: string;
  imageKey: string;
  tags?: string[];
  category?: string | null;
};

export type BrandIconUpdateData = {
  slug?: string;
  name?: string;
  imageUrl?: string;
  imageKey?: string;
  tags?: string[];
  category?: string | null;
  isActive?: boolean;
};

const BRAND_ICON_SLUG_REGEX = /^[a-z0-9-]{2,40}$/;

function normalizeBrandIconSlug(raw: string): string {
  const trimmed = (raw ?? "").trim().toLowerCase();
  const kebab = trimmed
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return kebab;
}

function validateBrandIconSlug(slug: string): { error?: string } {
  if (!slug) return { error: "Slug is required" };
  if (!BRAND_ICON_SLUG_REGEX.test(slug)) {
    return {
      error: "Slug must be 2–40 characters and use only lowercase letters, numbers, and dashes",
    };
  }
  return {};
}

function normalizeBrandIconTags(tags: string[] | undefined | null): string[] {
  if (!tags) return [];
  const normalized = tags
    .flatMap((t) => (Array.isArray(t) ? t : [t]))
    .map((t) => (t ?? "").toString().trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function stripScriptTags(svg: string): string {
  return svg.replace(/<script[\s\S]*?<\/script>/gi, "");
}

function stripEventHandlerAttributes(svg: string): string {
  // Remove on*="..." and on*='...' style event handler attributes
  return svg
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
}

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let value = match[1]!.toLowerCase();
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(value, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function clamp255(n: number) {
  return Math.max(0, Math.min(255, n));
}

function sq(n: number) {
  return n * n;
}

function rgbDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return { h: 0, s: 0, l };
  }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }
  h /= 6;
  return { h, s, l };
}

function parseRgbLike(color: string): Rgb | null {
  const rgbMatch = /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i.exec(color);
  if (rgbMatch) {
    return {
      r: Math.max(0, Math.min(255, Number(rgbMatch[1]))),
      g: Math.max(0, Math.min(255, Number(rgbMatch[2]))),
      b: Math.max(0, Math.min(255, Number(rgbMatch[3]))),
    };
  }
  const hslMatch = /hsla?\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%/i.exec(color);
  if (hslMatch) {
    const h = (Number(hslMatch[1]) % 360) / 360;
    const s = Math.max(0, Math.min(1, Number(hslMatch[2]) / 100));
    const l = Math.max(0, Math.min(1, Number(hslMatch[3]) / 100));
    if (s === 0) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hueToRgb = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const r = hueToRgb(h + 1 / 3);
    const g = hueToRgb(h);
    const b = hueToRgb(h - 1 / 3);
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }
  return null;
}

function findColorTokens(svg: string): string[] {
  const tokens = new Set<string>();
  const hexRegex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  const rgbRegex = /rgba?\([^)]+\)/gi;
  const hslRegex = /hsla?\([^)]+\)/gi;
  let m: RegExpExecArray | null;
  while ((m = hexRegex.exec(svg))) {
    tokens.add(m[0]);
  }
  while ((m = rgbRegex.exec(svg))) {
    tokens.add(m[0]);
  }
  while ((m = hslRegex.exec(svg))) {
    tokens.add(m[0]);
  }
  return Array.from(tokens);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSvgColors(svg: string, accentHex: string): string {
  const accentRgb = hexToRgb(accentHex) ?? { r: 244, g: 114, b: 22 }; // default #F47216
  const tokens = findColorTokens(svg);
  if (tokens.length === 0) return svg;

  const replacements = new Map<string, string>();
  for (const token of tokens) {
    const hexRgb = hexToRgb(token);
    const rgb = hexRgb ?? parseRgbLike(token);
    if (!rgb) {
      // If we can't parse it confidently, do not replace this token.
      continue;
    }
    const { s, l } = rgbToHsl(rgb);
    const distanceToAccent = rgbDistance(rgb, accentRgb);
    const isAccentLike = distanceToAccent < 80 || (s >= 0.55 && l >= 0.45);
    const mapped = isAccentLike ? "var(--brand-accent)" : "currentColor";
    replacements.set(token, mapped);
  }

  if (replacements.size === 0) return svg;

  let result = svg;
  for (const [from, to] of replacements) {
    const re = new RegExp(escapeRegExp(from), "g");
    result = result.replace(re, to);
  }
  return result;
}

function validateAndSanitizeSvg(
  rawSvg: string,
  accentHex: string
): { error?: string; svg?: string } {
  const svg = (rawSvg ?? "").toString().trim();
  if (!svg) return { error: "SVG is required" };
  const lower = svg.toLowerCase();
  if (!lower.includes("<svg") || !lower.includes("</svg")) {
    return { error: "SVG must contain <svg> and </svg> tags" };
  }
  if (lower.includes("<script")) {
    return { error: "SVG must not contain <script> tags" };
  }

  let sanitized = stripScriptTags(svg);
  sanitized = stripEventHandlerAttributes(sanitized);
  sanitized = normalizeSvgColors(sanitized, accentHex);
  const finalLower = sanitized.toLowerCase();

  // Basic safety and forbidden structural elements.
  if (finalLower.includes("<script")) {
    return { error: "SVG must not contain <script> tags" };
  }
  if (
    /<\/?\s*(filter|mask|clippath|pattern|image|text|foreignobject|style)\b/i.test(
      sanitized
    )
  ) {
    return {
      error:
        "SVG must not contain filter, mask, clipPath, pattern, image, text, foreignObject, or style elements",
    };
  }

  // Enforce 24x24 viewBox.
  const viewBoxMatch = sanitized.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  const viewBoxValue = viewBoxMatch?.[1]?.trim();
  if (!viewBoxValue) {
    return { error: 'SVG must define viewBox="0 0 24 24"' };
  }
  if (viewBoxValue !== "0 0 24 24") {
    return { error: 'SVG viewBox must be exactly "0 0 24 24"' };
  }

  // Disallow full-background rects like width="100%" or height="100%".
  if (/<rect\b[^>]*(width|height)\s*=\s*["']100%["']/i.test(sanitized)) {
    return { error: "SVG must not use full-size background rectangles" };
  }

  // Enforce stroke-width to be exactly 1.5 everywhere.
  const strokeWidthRegex = /stroke-width\s*=\s*["']([^"']+)["']/gi;
  let swMatch: RegExpExecArray | null;
  while ((swMatch = strokeWidthRegex.exec(sanitized))) {
    const rawValue = swMatch[1]?.trim() ?? "";
    const numeric = parseFloat(rawValue);
    if (!Number.isFinite(numeric)) {
      return { error: "SVG stroke-width must be a numeric value" };
    }
    if (numeric !== 1.5) {
      return {
        error: "SVG stroke-width must be exactly 1.5 for all strokes in the icon system.",
      };
    }
  }

  // Forbid fill="currentColor" and fill="var(--brand-accent)" entirely.
  const pathTagRegex = /<path\b[^>]*>/gi;
  let pathMatch: RegExpExecArray | null;
  while ((pathMatch = pathTagRegex.exec(sanitized))) {
    const tag = pathMatch[0];
    const fillMatch = tag.match(/\bfill\s*=\s*["']([^"']*)["']/i);
    const fill = fillMatch?.[1]?.trim();
    if (!fill || fill === "none" || fill === "transparent") continue;

    if (fill === "currentColor") {
      return {
        error:
          'SVG must not use fill="currentColor". Use stroke for outlines and fill="none" for main shapes.',
      };
    }

    if (fill === "var(--brand-accent)") {
      return {
        error:
          'SVG must not use fill="var(--brand-accent)". Use stroke="var(--brand-accent)" for a small accent instead.',
      };
    }
  }

  // Enforce that var(--brand-accent) is used at most once and only in stroke attributes.
  const accentStrokeMatches =
    sanitized.match(/\bstroke\s*=\s*["']var\(--brand-accent\)["']/gi) ?? [];
  const accentFillMatches =
    sanitized.match(/\bfill\s*=\s*["']var\(--brand-accent\)["']/gi) ?? [];

  if (accentFillMatches.length > 0) {
    return {
      error:
        'Accent color var(--brand-accent) may only be used in stroke attributes, never in fill.',
    };
  }

  if (accentStrokeMatches.length > 1) {
    return {
      error:
        "SVG may use var(--brand-accent) on only one small accent stroke in the icon.",
    };
  }

  const accentUsed = accentStrokeMatches.length === 1;

  // If accent is used, forbid any large circles/ellipses (radius/radii > 3).
  if (accentUsed) {
    const circleRegex = /<circle\b[^>]*>/gi;
    let circleMatch: RegExpExecArray | null;
    while ((circleMatch = circleRegex.exec(sanitized))) {
      const tag = circleMatch[0];
      const rMatch = tag.match(/\br\s*=\s*["']([^"']*)["']/i);
      const rVal = rMatch?.[1]?.trim();
      if (rVal) {
        const rNum = parseFloat(rVal);
        if (Number.isFinite(rNum) && rNum > 3) {
          return {
            error:
              "When using accent color, circles must have radius 3 or smaller to avoid giant accent dots.",
          };
        }
      }
    }

    const ellipseRegex = /<ellipse\b[^>]*>/gi;
    let ellipseMatch: RegExpExecArray | null;
    while ((ellipseMatch = ellipseRegex.exec(sanitized))) {
      const tag = ellipseMatch[0];
      const rxMatch = tag.match(/\brx\s*=\s*["']([^"']*)["']/i);
      const ryMatch = tag.match(/\bry\s*=\s*["']([^"']*)["']/i);
      const rxVal = rxMatch?.[1]?.trim();
      const ryVal = ryMatch?.[1]?.trim();
      const rxNum = rxVal ? parseFloat(rxVal) : NaN;
      const ryNum = ryVal ? parseFloat(ryVal) : NaN;
      if (
        (Number.isFinite(rxNum) && rxNum > 3) ||
        (Number.isFinite(ryNum) && ryNum > 3)
      ) {
        return {
          error:
            "When using accent color, ellipses must have radii 3 or smaller to avoid giant accent shapes.",
        };
      }
    }
  }

  // After normalization, ensure we only have allowed color values.
  const hexColorRegex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  const rgbColorRegex = /rgba?\([^)]+\)/gi;
  const hslColorRegex = /hsla?\([^)]+\)/gi;
  const disallowedStyleRegex =
    /\b(?:fill|stroke|color)\s*[:=]\s*["']?(?!currentColor\b|var\(--brand-accent\)|none\b|transparent\b)[^"';>\s]+/gi;

  if (
    hexColorRegex.test(sanitized) ||
    rgbColorRegex.test(sanitized) ||
    hslColorRegex.test(sanitized) ||
    disallowedStyleRegex.test(sanitized)
  ) {
    return {
      error:
        "SVG colors must resolve to only currentColor or var(--brand-accent) (plus none/transparent).",
    };
  }

  return { svg: sanitized };
}

async function getEffectiveBrandColors() {
  const settings = await prisma.companySettings.findFirst();
  const effectiveAccent = settings?.primaryColorHex ?? "#F47216";
  const effectiveText = settings?.textColorHex ?? "#18181B";
  return { effectiveAccent, effectiveText };
}

export async function listBrandIcons() {
  await requireAdmin();
  return prisma.brandIcon.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
}

export async function createBrandIconUploadAction(input: {
  filename?: string;
  contentType?: string;
}): Promise<{ uploadUrl: string; publicUrl: string; objectKey: string } | { error: string }> {
  await requireAdmin();

  const filename = (input.filename ?? "").toString().trim();
  const rawContentType = (input.contentType ?? "").toString().trim() || "image/png";
  const contentType = rawContentType || "image/png";

  if (contentType !== "image/png" || !filename.toLowerCase().endsWith(".png")) {
    return { error: "Icon must be a PNG with a transparent background." };
  }

  const ext = "png";

  const objectKey = `brand-icons/global/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  try {
    const { uploadUrl, publicUrl } = await getPresignedUploadUrl(objectKey, contentType);
    return { uploadUrl, publicUrl, objectKey };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Failed to create upload URL: ${msg}` };
  }
}

export async function createBrandIcon(
  data: BrandIconCreateData
): Promise<{ error?: string }> {
  await requireAdmin();
  const slug = normalizeBrandIconSlug(data.slug);
  const name = (data.name ?? "").trim();
  if (!name) return { error: "Name is required" };
  const slugValidation = validateBrandIconSlug(slug);
  if (slugValidation.error) return slugValidation;

  let imageUrl = (data.imageUrl ?? "").toString().trim();
  const imageKey = (data.imageKey ?? "").toString().trim();
  if (!imageUrl) return { error: "imageUrl is required" };
  if (!imageKey) return { error: "imageKey is required" };

  try {
    const original = await readObjectToBuffer(imageKey);
    const normalized = await normalizeAndValidateIconPng(original);
    if (normalized.error || !normalized.normalizedBuffer) {
      return { error: normalized.error ?? "Icon must be a PNG with a transparent background." };
    }
    const { publicUrl } = await uploadBuffer(imageKey, normalized.normalizedBuffer, "image/png");
    if (publicUrl) {
      imageUrl = publicUrl;
    }
  } catch {
    return { error: "Icon must be a PNG with a transparent background." };
  }

  const existing = await prisma.brandIcon.findUnique({ where: { slug } });
  if (existing) return { error: "An icon with this slug already exists" };

  const tags = normalizeBrandIconTags(data.tags);
  const category =
    data.category !== undefined && data.category !== null
      ? data.category.toString().trim() || null
      : null;

  await prisma.brandIcon.create({
    data: {
      slug,
      name,
      imageUrl,
      imageKey,
      tags,
      category,
    } as any,
  });
  revalidatePath("/admin/settings/branding/icons");
  return {};
}

export async function updateBrandIcon(
  id: string,
  data: BrandIconUpdateData
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.brandIcon.findUnique({ where: { id } });
  if (!existing) return { error: "Icon not found" };

  let slug: string | undefined;
  if (data.slug !== undefined) {
    slug = normalizeBrandIconSlug(data.slug);
    const slugValidation = validateBrandIconSlug(slug);
    if (slugValidation.error) return slugValidation;
    const duplicate = await prisma.brandIcon.findFirst({
      where: { slug, id: { not: id } },
    });
    if (duplicate) return { error: "An icon with this slug already exists" };
  }

  let name: string | undefined;
  if (data.name !== undefined) {
    name = (data.name ?? "").trim();
    if (!name) return { error: "Name is required" };
  }

  let imageUrl: string | undefined;
  if (data.imageUrl !== undefined) {
    const url = (data.imageUrl ?? "").toString().trim();
    if (!url) return { error: "imageUrl cannot be blank" };
    imageUrl = url;
  }

  let imageKey: string | undefined;
  if (data.imageKey !== undefined) {
    const key = (data.imageKey ?? "").toString().trim();
    if (!key) return { error: "imageKey cannot be blank" };
    imageKey = key;

    try {
      const original = await readObjectToBuffer(key);
      const normalized = await normalizeAndValidateIconPng(original);
      if (normalized.error || !normalized.normalizedBuffer) {
        return { error: normalized.error ?? "Icon must be a PNG with a transparent background." };
      }
      const { publicUrl } = await uploadBuffer(key, normalized.normalizedBuffer, "image/png");
      if (publicUrl) {
        imageUrl = publicUrl;
      }
    } catch {
      return { error: "Icon must be a PNG with a transparent background." };
    }
  }

  const tags =
    data.tags !== undefined ? normalizeBrandIconTags(data.tags) : undefined;
  const category =
    data.category !== undefined
      ? data.category === null
        ? null
        : data.category.toString().trim() || null
      : undefined;

  const isActive =
    data.isActive !== undefined ? Boolean(data.isActive) : undefined;

  await prisma.brandIcon.update({
    where: { id },
    data: {
      ...(slug !== undefined && { slug }),
      ...(name !== undefined && { name }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(imageKey !== undefined && { imageKey }),
      ...(tags !== undefined && { tags }),
      ...(category !== undefined && { category }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  revalidatePath("/admin/settings/branding/icons");
  return {};
}

export async function toggleBrandIconActive(
  id: string,
  isActive: boolean
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.brandIcon.findUnique({ where: { id } });
  if (!existing) return { error: "Icon not found" };
  await prisma.brandIcon.update({
    where: { id },
    data: { isActive },
  });
  revalidatePath("/admin/settings/branding/icons");
  return {};
}

export async function deleteBrandIcon(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.brandIcon.findUnique({ where: { id } });
  if (!existing) return { error: "Icon not found" };
  const imageKey = (existing as { imageKey?: string | null }).imageKey;
  if (imageKey) {
    try {
      await deleteR2Objects([imageKey]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Failed to delete icon from storage: ${msg}` };
    }
  }
  await prisma.brandIcon.delete({ where: { id } });
  revalidatePath("/admin/settings/branding/icons");
  return {};
}

// ---------------------------------------------------------------------------
// Seed default icons into BrandIcon library
// ---------------------------------------------------------------------------

import { DEFAULT_ICON_SVGS } from "@/app/lib/default-icon-svgs";

/**
 * Seed default Lucide-style icons into the BrandIcon library.
 * Uploads SVG strings to R2 and creates BrandIcon records.
 * Skips icons whose slugs already exist.
 * Returns the count of newly created icons.
 */
export async function seedDefaultBrandIconsAction(): Promise<{ created: number; error?: string }> {
  await requireAdmin();
  let created = 0;

  for (const [slug, { name, svg }] of Object.entries(DEFAULT_ICON_SVGS)) {
    const existing = await prisma.brandIcon.findUnique({ where: { slug } });
    if (existing) continue;

    const objectKey = `brand-icons/global/default-${slug}.svg`;
    try {
      const buffer = Buffer.from(svg, "utf-8");
      const { publicUrl } = await uploadBuffer(objectKey, buffer, "image/svg+xml");
      await prisma.brandIcon.create({
        data: {
          slug,
          name,
          imageUrl: publicUrl,
          imageKey: objectKey,
          tags: ["default", "lucide"],
          category: "default",
          isActive: true,
        },
      });
      created++;
    } catch {
      // Skip failed icons, continue with rest
    }
  }

  revalidatePath("/admin/settings/branding/icons");
  return { created };
}
