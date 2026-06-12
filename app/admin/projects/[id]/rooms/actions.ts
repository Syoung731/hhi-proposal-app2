"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@/app/generated/prisma";
import { normalizeRoomName } from "@/app/lib/room-utils";
import { parseFeetInchesToInches } from "@/app/lib/dimensions";
import {
  computeUnitQuantity,
  type RoomLikeForUnitQuantity,
} from "@/app/lib/section-unit-quantity";
import { computeSectionTotals } from "@/app/lib/section-totals";
import { recomputeInvestmentRollups } from "@/app/lib/investment-rollup";
import { ensureCopeRoom } from "@/app/lib/ensure-cope-room";
import { dissolveSingleMemberGroups } from "@/app/lib/investment/assign-display-group";
import {
  extractRoomsFromTranscript,
  rewriteRoomScopeNarrative,
  mergeRoomScopesNarrative,
} from "@/app/lib/ai/extract-from-transcript";
import { generateScopeOverviewNarrative } from "@/app/lib/ai/objective-content";
import { generateRecommendedDetail } from "@/app/lib/ai/generate-recommended-detail";
import { classifyRoomForDetail, type KitchenDetail, type BathroomDetail } from "@/app/lib/room-classification";
import { buildRendrContextString } from "@/app/lib/rendr/buildRendrContext";
import { getRendrSpaceGeometry } from "@/app/lib/rendr/rendrClient";
import { linkedSpaceIds, primaryLinkedSpaceId } from "@/app/lib/rendr/linkedSpaces";
import { fetchMergedTakeoff, type MergedTakeoffData } from "@/app/lib/rendr/mergeTakeoffs";
import type { ImperialTakeoffData, ImperialRoomTakeoff } from "@/app/lib/rendr/types";
import { fuzzyMatchRooms } from "@/app/lib/rendr/roomMatcher";
import { extractCeilingHeightForMappedRooms, type GeometryData } from "@/app/lib/rendr/extractCeilingHeight";
import { z } from "zod";

export type UnmatchedRoomItem = { name: string; roomIds: string[] };

/** AI-extracted room/section shape; optional dimensions may be present and are persisted. */
type ExtractedSection = {
  name: string;
  scopeNarrative: string;
  lengthIn?: number | null;
  widthIn?: number | null;
  ceilingHeightIn?: number | null;
  length?: string | null;
  width?: string | null;
  ceilingHeight?: string | null;
  fixtures?: import("@/app/lib/ai/extract-from-transcript").TranscriptFixtures | null;
};

/** Normalize for dedupe comparison: trim, collapse spaces, normalize separators, collapse again, lowercase. */
function normalizeRoomNameForCompare(name: string): string {
  const collapsed = name.trim().replace(/\s+/g, " ");
  const withSpaces = collapsed.replace(/[\/\\\-&,:]/g, " ");
  return withSpaces.replace(/\s+/g, " ").toLowerCase();
}

/** Canonical room name aliases (normalized key -> canonical normalized). Conservative to avoid merging different rooms. */
const ROOM_ALIAS_MAP: Record<string, string> = {
  "master bath": "primary bath",
  "master bathroom": "primary bath",
  "primary bathroom": "primary bath",
  "foyer": "entry/hall",
  "entry": "entry/hall",
  "screen porch": "screened porch",
};

/** Display labels for canonical names when we want something nicer than titleCase. */
const CANONICAL_DISPLAY: Record<string, string> = {
  "entry/hall": "Entry/Hall",
  "primary bath": "Primary Bath",
  "screened porch": "Screened Porch",
  "wet dry bar": "Wet / Dry Bar",
  "wet/dry bar": "Wet / Dry Bar",
};

/**
 * Apply alias normalization to a trimmed/collapsed/lower name.
 * "porch" -> "screened porch" only when transcriptContext contains "screen" (conservative).
 */
function applyAlias(normalizedName: string, transcriptContext: string): string {
  const lowerContext = transcriptContext.toLowerCase();
  if (normalizedName === "porch" && (lowerContext.includes("screen") || lowerContext.includes("screened"))) {
    return "screened porch";
  }
  return ROOM_ALIAS_MAP[normalizedName] ?? normalizedName;
}

/** Stored name: display label for canonical, or titleCase of canonical. */
function displayNameForCanonical(canonicalName: string): string {
  return CANONICAL_DISPLAY[canonicalName] ?? titleCaseRoomName(canonicalName);
}

/** Simple title case for room names. */
function titleCaseRoomName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/** Build map: normalized room name -> roomTypeId for matching. Exact normalized match only (high confidence). */
async function getRoomTypeNormalizedMap(): Promise<Map<string, string>> {
  const types = await prisma.roomType.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });
  const map = new Map<string, string>();
  for (const t of types) {
    const key = normalizeRoomName(t.name);
    if (key && !map.has(key)) map.set(key, t.id);
  }
  return map;
}

/** Build map: normalized section type name -> sectionTypeId for matching (e.g. "primary bath" -> Bathroom SectionType id). */
async function getSectionTypeNormalizedMap(): Promise<Map<string, string>> {
  const types = await prisma.sectionType.findMany({
    select: { id: true, name: true },
  });
  const map = new Map<string, string>();
  for (const t of types) {
    const key = normalizeRoomName(t.name);
    if (key && !map.has(key)) map.set(key, t.id);
  }
  return map;
}

const nullableNumberFormField = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === undefined || value === null) return null;
    const s = String(value).trim();
    if (!s) return null;
    const n = Number(s);
    if (Number.isNaN(n)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Must be a number.",
      });
      return z.NEVER;
    }
    return n;
  });

const roomNumericFieldsSchema = z.object({
  estPricePerSqFt: nullableNumberFormField,
});

export async function updateRoomDetailAction(
  projectId: string,
  roomId: string,
  roomDetail: Record<string, unknown>,
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  await prisma.room.update({
    where: { id: roomId },
    data: { roomDetail: roomDetail as unknown as Prisma.InputJsonValue },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  return {};
}

export async function createRoomAction(projectId: string, formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const name = (formData.get("name") as string)?.trim() ?? "";

  // Prevent manual duplication of the COPE room
  const nameLC = name.toLowerCase();
  if (nameLC.includes("cope") || nameLC.includes("cost of project execution")) {
    const existingCope = await prisma.room.findFirst({
      where: { projectId, isProjectOverhead: true },
    });
    if (existingCope) {
      return { error: "A COPE room already exists for this project." };
    }
  }
  const scopeNarrative = (formData.get("scopeNarrative") as string)?.trim() ?? "";
  const maxOrder = await prisma.room
    .aggregate({ where: { projectId }, _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  const sectionTypeIdRaw = (formData.get("sectionTypeId") as string)?.trim() || null;
  // If no sectionTypeId was submitted, keep the existing one so changing dimensions
  // doesn't reset the Pricing Profile back to Custom.
  const sectionTypeId =
    sectionTypeIdRaw && sectionTypeIdRaw !== "" ? sectionTypeIdRaw : null;
  const created = await prisma.room.create({
    data: {
      projectId,
      name: name || "Section",
      scopeNarrative,
      scopeSource: "MANUAL",
      scopeUpdatedAt: new Date(),
      sortOrder: maxOrder + 1,
      sectionTypeId,
      origin: "MANUAL",
      bucket: "BASE",
    },
    select: { id: true },
  });
  // New rooms start as their own standalone group. The user explicitly
  // groups rooms via the drag-merge popup in the Investment tab; running
  // dissolveSingleMemberGroups here normalizes the new room's slug to
  // `standalone-{id}` so it renders as its own line item everywhere
  // (not bucketed into a generic "Ungrouped" lump on the deck slide).
  await dissolveSingleMemberGroups(projectId);
  await recomputeInvestmentRollups(projectId);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function updateRoomAction(
  projectId: string,
  roomId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    include: {
      sectionType: {
        select: {
          defaultMeasurementMode: true,
          defaultEstimateUnit: true,
          pricingBasis: true,
          priceLow: true,
          priceTarget: true,
          priceHigh: true,
        },
      },
      roomType: { select: { pricePerSqFtLow: true, pricePerSqFtTarget: true, pricePerSqFtHigh: true } },
    },
  });
  if (!room) return { error: "Room not found" };
  const name = (formData.get("name") as string)?.trim() ?? "";
  const scopeNarrative = (formData.get("scopeNarrative") as string)?.trim() ?? "";
  const numericResult = roomNumericFieldsSchema.safeParse({
    estPricePerSqFt: formData.get("estPricePerSqFt") as unknown,
  });
  if (!numericResult.success) {
    const estIssue = numericResult.error.issues.find(
      (issue) => issue.path[0] === "estPricePerSqFt"
    );
    if (estIssue) {
      return { error: "Price per sq ft must be a number greater than 0." };
    }
    return { error: "Invalid price." };
  }
  const { estPricePerSqFt } = numericResult.data;
  if (estPricePerSqFt !== null && estPricePerSqFt <= 0) {
    return { error: "Price per sq ft must be a number greater than 0." };
  }

  const lengthRaw = (formData.get("lengthIn") as string)?.trim() ?? "";
  const widthRaw = (formData.get("widthIn") as string)?.trim() ?? "";
  const ceilingHeightRaw = (formData.get("ceilingHeightIn") as string)?.trim() ?? "";

  let lengthIn: number | null = null;
  let widthIn: number | null = null;
  let ceilingHeightIn: number | null = null;

  if (lengthRaw !== "") {
    const parsed = parseFeetInchesToInches(lengthRaw);
    if (parsed.error) return { error: `Length: ${parsed.error}` };
    lengthIn = parsed.inches;
  }
  if (widthRaw !== "") {
    const parsed = parseFeetInchesToInches(widthRaw);
    if (parsed.error) return { error: `Width: ${parsed.error}` };
    widthIn = parsed.inches;
  }
  if (ceilingHeightRaw !== "") {
    const parsed = parseFeetInchesToInches(ceilingHeightRaw);
    if (parsed.error) return { error: `Ceiling height: ${parsed.error}` };
    ceilingHeightIn = parsed.inches;
  }

  const sectionTypeIdRaw = (formData.get("sectionTypeId") as string)?.trim() || null;
  const sectionTypeId = sectionTypeIdRaw && sectionTypeIdRaw !== "" ? sectionTypeIdRaw : null;
  const originRaw = (formData.get("origin") as string)?.trim();
  const origin = ["MANUAL", "AI_TRANSCRIPT", "TEMPLATE", "IMPORTED"].includes(originRaw ?? "")
    ? (originRaw as "MANUAL" | "AI_TRANSCRIPT" | "TEMPLATE" | "IMPORTED")
    : room.origin;
  const measurementModeRaw = (formData.get("measurementMode") as string)?.trim() || null;
  const measurementMode =
    measurementModeRaw === "" || measurementModeRaw === "USE_TYPE_DEFAULT"
      ? null
      : ["NONE", "DIMENSIONS", "AREA", "COUNT"].includes(measurementModeRaw ?? "")
        ? (measurementModeRaw as "NONE" | "DIMENSIONS" | "AREA" | "COUNT")
        : null;
  const areaSqFtRaw = (formData.get("areaSqFt") as string)?.trim();
  const areaSqFt = areaSqFtRaw === "" ? null : Number(areaSqFtRaw);
  const quantityRaw = (formData.get("quantity") as string)?.trim();
  const quantity = quantityRaw === "" ? null : parseInt(quantityRaw ?? "", 10);
  const estimateUnitRaw = (formData.get("estimateUnit") as string)?.trim() || null;
  const estimateUnit =
    estimateUnitRaw === "" || estimateUnitRaw === "USE_TYPE_DEFAULT"
      ? null
      : ["SF", "LF", "EA", "SQ", "HR", "DAY", "ROOM", "UNIT", "GAL", "CUSTOM"].includes(estimateUnitRaw ?? "")
        ? (estimateUnitRaw as "SF" | "LF" | "EA" | "SQ" | "HR" | "DAY" | "ROOM" | "UNIT" | "GAL" | "CUSTOM")
        : null;
  const customUnitLabel = (formData.get("customUnitLabel") as string)?.trim() || null;
  const unitQuantityManualOverride = formData.get("unitQuantityManualOverride") === "true";
  const unitQuantityOverrideRaw = (formData.get("unitQuantityOverride") as string)?.trim();
  const unitQuantityOverride = unitQuantityOverrideRaw === "" ? null : Number(unitQuantityOverrideRaw);
  const bucketRaw = (formData.get("bucket") as string)?.trim();
  const bucket = ["BASE", "ALTERNATE", "ALLOWANCE"].includes(bucketRaw ?? "")
    ? (bucketRaw as "BASE" | "ALTERNATE" | "ALLOWANCE")
    : room.bucket;
  // Optional explicit source toggle (sent by the Rendr/Transcript radio).
  // When provided, takes priority over the dimsChanged heuristic below.
  const measurementSourceRaw = (formData.get("measurementSource") as string)?.trim();
  const measurementSourceOverride =
    measurementSourceRaw === "rendr" || measurementSourceRaw === "manual" || measurementSourceRaw === "transcript"
      ? measurementSourceRaw
      : null;
  const unitRateLowRaw = (formData.get("unitRateLow") as string)?.trim();
  const unitRateTargetRaw = (formData.get("unitRateTarget") as string)?.trim();
  const unitRateHighRaw = (formData.get("unitRateHigh") as string)?.trim();
  const unitRateLowForm = unitRateLowRaw === "" ? null : Number(unitRateLowRaw);
  const unitRateTargetForm = unitRateTargetRaw === "" ? null : Number(unitRateTargetRaw);
  const unitRateHighForm = unitRateHighRaw === "" ? null : Number(unitRateHighRaw);
  const hasUnitRateOverride =
    unitRateLowForm != null && !Number.isNaN(unitRateLowForm) ||
    unitRateTargetForm != null && !Number.isNaN(unitRateTargetForm) ||
    unitRateHighForm != null && !Number.isNaN(unitRateHighForm);

  // areaSqFt: from form if valid number; else from lengthIn/widthIn when both present;
  // otherwise keep existing areaSqFt (which will later be recomputed from sub-areas, if any).
  let resolvedAreaSqFtBase: number | null = null;
  if (areaSqFt != null && !Number.isNaN(areaSqFt) && areaSqFt >= 0) {
    resolvedAreaSqFtBase = areaSqFt;
  } else if (lengthIn != null && widthIn != null && lengthIn > 0 && widthIn > 0) {
    resolvedAreaSqFtBase = Math.round((lengthIn / 12) * (widthIn / 12) * 100) / 100;
  } else {
    resolvedAreaSqFtBase = room.areaSqFt;
  }
  const resolvedAreaSqFt = resolvedAreaSqFtBase;

  const mergedForUnitQty: RoomLikeForUnitQuantity = {
    ...room,
    lengthIn,
    widthIn,
    areaSqFt: resolvedAreaSqFt ?? null,
    quantity: quantity ?? room.quantity,
    measurementMode: measurementMode ?? undefined,
  };
  const defaultMode = room.sectionType?.defaultMeasurementMode ?? null;
  const defaultUnit = room.sectionType?.defaultEstimateUnit ?? null;
  const effectiveMode = measurementMode ?? defaultMode ?? "NONE";
  const effectiveUnit = estimateUnit ?? defaultUnit ?? "SF";
  const computedUnitQty = computeUnitQuantity(mergedForUnitQty, defaultMode);
  let unitQuantity: number | null =
    unitQuantityManualOverride && unitQuantityOverride != null && !Number.isNaN(unitQuantityOverride)
      ? unitQuantityOverride
      : unitQuantityManualOverride
        ? room.unitQuantity
        : computedUnitQty;

  // Unit rates: form override, or from sectionType (Pricing Profile) by basis, or from roomType (legacy)
  let unitRateLow = room.unitRateLow;
  let unitRateTarget = room.unitRateTarget;
  let unitRateHigh = room.unitRateHigh;
  let forceUnitQuantityOne = false;

  if (hasUnitRateOverride) {
    unitRateLow = unitRateLowForm != null && !Number.isNaN(unitRateLowForm) ? unitRateLowForm : unitRateLow;
    unitRateTarget = unitRateTargetForm != null && !Number.isNaN(unitRateTargetForm) ? unitRateTargetForm : unitRateTarget;
    unitRateHigh = unitRateHighForm != null && !Number.isNaN(unitRateHighForm) ? unitRateHighForm : unitRateHigh;
  } else if (room.sectionTypeId && room.sectionType) {
    const st = room.sectionType;
    const basis = st.pricingBasis ?? "NONE";
    if (basis === "PER_SF" && (effectiveMode === "AREA" || effectiveMode === "DIMENSIONS")) {
      unitRateLow = st.priceLow ?? unitRateLow;
      unitRateTarget = st.priceTarget ?? unitRateTarget;
      unitRateHigh = st.priceHigh ?? unitRateHigh;
    } else if (basis === "PER_EACH") {
      unitRateLow = st.priceLow ?? unitRateLow;
      unitRateTarget = st.priceTarget ?? unitRateTarget;
      unitRateHigh = st.priceHigh ?? unitRateHigh;
      // Quantity comes from COUNT or form; no override
    } else if (basis === "PER_JOB") {
      unitRateLow = st.priceLow ?? unitRateLow;
      unitRateTarget = st.priceTarget ?? unitRateTarget;
      unitRateHigh = st.priceHigh ?? unitRateHigh;
      forceUnitQuantityOne = true;
    }
    // NONE: do not set unit rates from sectionType
  } else if (
    room.roomTypeId &&
    room.roomType &&
    (effectiveMode === "AREA" || effectiveMode === "DIMENSIONS")
  ) {
    unitRateLow = room.roomType.pricePerSqFtLow ?? unitRateLow;
    unitRateTarget = room.roomType.pricePerSqFtTarget ?? unitRateTarget;
    unitRateHigh = room.roomType.pricePerSqFtHigh ?? unitRateHigh;
  }

  if (forceUnitQuantityOne) {
    unitQuantity = 1;
  }

  const data: {
    name: string;
    scopeNarrative: string;
    scopeSource: string;
    scopeUpdatedAt: Date;
    estPricePerSqFt: number | null;
    lengthIn: number | null;
    widthIn: number | null;
    ceilingHeightIn: number | null;
    sectionTypeId: string | null;
    origin: "MANUAL" | "AI_TRANSCRIPT" | "TEMPLATE" | "IMPORTED";
    measurementMode: "NONE" | "DIMENSIONS" | "AREA" | "COUNT" | null;
    areaSqFt: number | null;
    quantity: number | null;
    estimateUnit: "SF" | "LF" | "EA" | "SQ" | "HR" | "DAY" | "ROOM" | "UNIT" | "GAL" | "CUSTOM" | null;
    customUnitLabel: string | null;
    unitQuantity: number | null;
    unitQuantityManualOverride: boolean;
    unitRateLow: number | null;
    unitRateTarget: number | null;
    unitRateHigh: number | null;
    totalLow: number | null;
    totalTarget: number | null;
    totalHigh: number | null;
    bucket: "BASE" | "ALTERNATE" | "ALLOWANCE";
    measurementSource?: string | null;
  } = {
    name: name || "Section",
    scopeNarrative,
    scopeSource: "MANUAL",
    scopeUpdatedAt: new Date(),
    estPricePerSqFt,
    lengthIn,
    widthIn,
    ceilingHeightIn,
    sectionTypeId,
    origin,
    measurementMode,
    areaSqFt: resolvedAreaSqFt,
    quantity: quantity != null && !Number.isNaN(quantity) ? quantity : null,
    estimateUnit,
    customUnitLabel: estimateUnit === "CUSTOM" ? customUnitLabel : null,
    unitQuantity: unitQuantity ?? null,
    unitQuantityManualOverride,
    unitRateLow,
    unitRateTarget,
    unitRateHigh,
    totalLow: null,
    totalTarget: null,
    totalHigh: null,
    bucket,
  };

  // Track measurement source: explicit toggle wins; otherwise fall back to
  // the heuristic that flips to "manual" when the user edits dimensions.
  if (measurementSourceOverride) {
    data.measurementSource = measurementSourceOverride;
  } else {
    const dimsChanged =
      lengthIn !== room.lengthIn ||
      widthIn !== room.widthIn ||
      ceilingHeightIn !== room.ceilingHeightIn ||
      (resolvedAreaSqFt !== room.areaSqFt && resolvedAreaSqFt !== null);
    if (dimsChanged && (lengthIn != null || widthIn != null || resolvedAreaSqFt != null)) {
      data.measurementSource = "manual";
    }
  }

  if (!unitQuantityManualOverride && !forceUnitQuantityOne) {
    data.unitQuantity = computedUnitQty;
  }
  const totals = computeSectionTotals(
    {
      estimateUnit: data.estimateUnit,
      unitQuantity: data.unitQuantity,
      unitRateLow: data.unitRateLow,
      unitRateTarget: data.unitRateTarget,
      unitRateHigh: data.unitRateHigh,
    },
    room.sectionType
  );
  data.totalLow = totals.totalLow;
  data.totalTarget = totals.totalTarget;
  data.totalHigh = totals.totalHigh;
  await prisma.room.update({
    where: { id: roomId },
    data,
  });

  // Flag estimate as stale if scope or dimensions changed
  const scopeChanged = scopeNarrative !== (room.scopeNarrative ?? "");
  const staleDimsChanged =
    lengthIn !== room.lengthIn ||
    widthIn !== room.widthIn ||
    ceilingHeightIn !== room.ceilingHeightIn;
  if (scopeChanged || staleDimsChanged) {
    const hasEstimate = await prisma.aIEstimate.findFirst({
      where: { sectionId: roomId },
      select: { id: true },
    });
    if (hasEstimate) {
      const reason = scopeChanged && staleDimsChanged
        ? "Scope and dimensions changed after estimate"
        : scopeChanged
          ? "Scope updated after estimate"
          : "Dimensions changed after estimate";
      await prisma.room.update({
        where: { id: roomId },
        data: { estimateStaleReason: reason },
      });
    }

    // Also flag COPE as stale when any room's dimensions or scope change,
    // since COPE aggregates data from all rooms (total SF, total value, etc.)
    if (staleDimsChanged) {
      const copeRoom = await prisma.room.findFirst({
        where: { projectId, isProjectOverhead: true },
        select: { id: true },
      });
      if (copeRoom) {
        const copeHasEstimate = await prisma.aIEstimate.findFirst({
          where: { sectionId: copeRoom.id },
          select: { id: true },
        });
        if (copeHasEstimate) {
          await prisma.room.update({
            where: { id: copeRoom.id },
            data: { estimateStaleReason: "Room dimensions changed — COPE may need regeneration" },
          });
        }
      }
    }
  }

  // After updating main room dimensions, recompute total area from any included sub-areas.
  await recomputeRoomAreaFromSubAreas(roomId);
  await recomputeInvestmentRollups(projectId);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function updateRoomTemplateAction(
  projectId: string,
  roomId: string,
  roomTemplateId: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  await prisma.room.update({
    where: { id: roomId },
    data: { roomTemplateId },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  return {};
}

export async function updateRoomStylePresetAction(
  projectId: string,
  roomId: string,
  stylePresetId: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  if (stylePresetId) {
    const preset = await prisma.stylePreset.findUnique({ where: { id: stylePresetId } });
    if (!preset?.isActive) return { error: "Style preset not found or inactive" };
  }
  await prisma.room.update({
    where: { id: roomId },
    data: { stylePresetId },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function deleteRoomAction(projectId: string, roomId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  if (room.isProjectOverhead) {
    return { error: "Cannot delete the COPE room. It is required for project overhead." };
  }
  await prisma.room.delete({ where: { id: roomId } });
  await recomputeInvestmentRollups(projectId);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/** Delete all sections for a project. */
export async function deleteAllRoomsAction(projectId: string): Promise<{ error?: string }> {
  await requireAdmin();
  // Deleting rooms orphans any existing COPE AIEstimate (sectionId has no FK
  // cascade), so reset the project's COPE lock atomically to avoid a stale
  // `copeStatus=READY` pointing at a deleted room. See PHASE_9_AIESTIMATE_FK_CLEANUP.md.
  await prisma.$transaction([
    prisma.room.deleteMany({ where: { projectId } }),
    prisma.project.update({
      where: { id: projectId },
      data: { copeStatus: "IDLE", copeGeneratedAt: null, copeError: null },
    }),
  ]);
  await recomputeInvestmentRollups(projectId);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function moveRoomOrderAction(
  projectId: string,
  roomId: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  const list = await prisma.room.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  const idx = list.findIndex((r) => r.id === roomId);
  if (idx < 0) return { error: "Room not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return {};
  const other = list[swapIdx]!;
  await prisma.$transaction([
    prisma.room.update({ where: { id: roomId }, data: { sortOrder: other.sortOrder } }),
    prisma.room.update({ where: { id: other.id }, data: { sortOrder: room.sortOrder } }),
  ]);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function reorderRoomsAction(
  projectId: string,
  orderedIds: string[]
): Promise<{ error?: string }> {
  await requireAdmin();

  if (!orderedIds.length) {
    return {};
  }

  const rooms = await prisma.room.findMany({
    where: {
      projectId,
      id: { in: orderedIds },
    },
    select: { id: true },
  });

  // Validate all provided IDs belong to this project
  const validIds = new Set(rooms.map((r) => r.id));
  if (validIds.size !== orderedIds.length) {
    return { error: "Invalid room ids for this project." };
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.room.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/preview`);

  return {};
}

// ---------------------------------------------------------------------------
// Rendr availability check (fast — for UI confirmation modal)
// ---------------------------------------------------------------------------

export async function checkRendrAvailable(projectId: string): Promise<{
  hasRendr: boolean;
  roomCount: number;
}> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { rendrSpaces: true, rendrImportedAt: true },
  });
  const spaceIds = linkedSpaceIds(project?.rendrSpaces);
  if (spaceIds.length === 0) {
    return { hasRendr: false, roomCount: 0 };
  }
  try {
    const merged = await fetchMergedTakeoff(spaceIds);
    return { hasRendr: true, roomCount: merged?.rooms.length ?? 0 };
  } catch {
    // Rendr API may be down — still flag as linked but no room count
    return { hasRendr: true, roomCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// Build Rendr context string for AI transcript extraction
// ---------------------------------------------------------------------------

function buildRendrContextForTranscript(imperial: ImperialTakeoffData, geometryData: GeometryData | null): string {
  if (!imperial.rooms.length) return "";

  const lines: string[] = [
    "RENDR LIDAR SCAN DATA — Physical rooms measured by LiDAR:",
    "",
  ];

  for (const room of imperial.rooms) {
    if (room.label === "All Rooms") continue;
    const t = room.takeoff;

    // Extract ceiling height from geometry if available
    const ceilingFt = extractCeilingHeightForMappedRooms(geometryData, [room.label]);

    let roomLine = `${room.label}: ${t.floorSF} SF floor, ${t.wallsSF} SF walls, ${t.perimeterLF} LF perimeter`;
    if (ceilingFt) roomLine += `, ${ceilingFt} ft ceiling`;
    if (t.numberOfWindows) roomLine += `, ${t.numberOfWindows} windows`;
    if (t.numberOfDoors) roomLine += `, ${t.numberOfDoors} doors`;

    const fixtures: string[] = [];
    if (t.numberOfBaseCabinets) fixtures.push(`${t.numberOfBaseCabinets} base cabinets (${t.baseCabinetsLF} LF)`);
    if (t.numberOfWallCabinets) fixtures.push(`${t.numberOfWallCabinets} wall cabinets (${t.wallCabinetsLF} LF)`);
    if (t.countertopsSF) fixtures.push(`${t.countertopsSF} SF countertop`);
    if (t.backsplashSF) fixtures.push(`${t.backsplashSF} SF backsplash`);
    if (t.numberOfSinks) fixtures.push(`${t.numberOfSinks} sink(s)`);
    if (t.numberOfToilets) fixtures.push(`${t.numberOfToilets} toilet(s)`);
    if (t.numberOfBathtubs) fixtures.push(`${t.numberOfBathtubs} bathtub(s)`);
    if (t.numberOfStoves) fixtures.push("stove");
    if (t.numberOfOvens) fixtures.push("oven");
    if (t.numberOfRefrigerators) fixtures.push("refrigerator");
    if (t.numberOfDishwashers) fixtures.push("dishwasher");
    if (t.numberOfFirePlaces) fixtures.push(`${t.numberOfFirePlaces} fireplace(s)`);

    if (fixtures.length > 0) {
      roomLine += ` | Fixtures: ${fixtures.join(", ")}`;
    }

    lines.push(`  ${roomLine}`);
  }

  lines.push("");
  lines.push("Use this data to inform section measurements and fixture references in scope narratives.");
  lines.push("The room names from Rendr represent the PHYSICAL spaces. The transcript may discuss");
  lines.push("these spaces by different names or combine them into scope-based sections.");

  return lines.join("\n");
}

/** Build a human-readable pricing notes summary from Rendr takeoff data. */
function buildPricingNotesSummary(
  t: ImperialRoomTakeoff,
  mappings: { index: number; label: string }[],
): string {
  const header =
    mappings.length > 1
      ? `LiDAR Import (combined: ${mappings.map((m) => m.label).join(" + ")}):`
      : `LiDAR Import:`;

  return [
    `${header} Floor ${t.floorSF} SF, Walls ${t.wallsSF} SF, Ceiling ${t.ceilingSF} SF`,
    `Perimeter ${t.perimeterLF} LF, Paintable ${t.paintableSF} SF`,
    t.numberOfWindows ? `Windows: ${t.numberOfWindows} (${t.windowsSF} SF)` : null,
    t.numberOfDoors ? `Doors: ${t.numberOfDoors} (${t.doorsSF} SF)` : null,
    t.numberOfSinks ? `Sinks: ${t.numberOfSinks}` : null,
    t.numberOfToilets ? `Toilets: ${t.numberOfToilets}` : null,
    t.numberOfBathtubs ? `Bathtubs: ${t.numberOfBathtubs}` : null,
    t.baseCabinetsLF ? `Base Cabinets: ${t.numberOfBaseCabinets} (${t.baseCabinetsLF} LF)` : null,
    t.wallCabinetsLF ? `Wall Cabinets: ${t.numberOfWallCabinets} (${t.wallCabinetsLF} LF)` : null,
    t.countertopsLF ? `Countertops: ${t.countertopsLF} LF (${t.countertopsSF} SF)` : null,
    t.backsplashLF ? `Backsplash: ${t.backsplashLF} LF (${t.backsplashSF} SF)` : null,
    t.numberOfFirePlaces ? `Fireplaces: ${t.numberOfFirePlaces}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Generate rooms from transcript (with optional Rendr context)
// ---------------------------------------------------------------------------

export async function generateRoomsFromTranscriptAction(
  projectId: string,
  includeRendr: boolean = false,
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  error?: string;
  unmatchedRooms?: UnmatchedRoomItem[];
}> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, transcriptText: true, rendrSpaces: true },
  });
  if (!project) {
    return { created: 0, updated: 0, skipped: 0, error: "Project not found." };
  }
  const transcriptText = project.transcriptText?.trim() ?? "";
  if (!transcriptText) {
    return { created: 0, updated: 0, skipped: 0, error: "No transcript available." };
  }

  // Fetch Rendr data when requested (best-effort — failures fall back to transcript-only)
  let rendrContext: string | null = null;
  let imperialTakeoff: MergedTakeoffData | null = null;
  let geometryData: GeometryData | null = null;

  const rendrSpaceIdsForContext = linkedSpaceIds(project.rendrSpaces);
  if (includeRendr && rendrSpaceIdsForContext.length > 0) {
    try {
      // Merge rooms across all linked spaces (floors) so the AI sees every room.
      imperialTakeoff = await fetchMergedTakeoff(rendrSpaceIdsForContext);
      // Geometry (ceiling heights) is best-effort; use the primary space's blob.
      const primaryId = primaryLinkedSpaceId(project.rendrSpaces);
      if (primaryId != null) {
        try {
          geometryData = await getRendrSpaceGeometry(primaryId) as GeometryData | null;
        } catch {
          // Geometry is optional — ceiling heights won't be available
        }
      }
      if (imperialTakeoff) {
        rendrContext = buildRendrContextForTranscript(imperialTakeoff, geometryData);
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.log("[generateRooms] Rendr fetch failed, continuing without:", e);
      }
    }
  }

  // Fetch existing section names to pass to AI (so it reuses them instead of inventing variants)
  const existingSections = await prisma.room.findMany({
    where: { projectId, isProjectOverhead: false },
    select: { name: true },
  });
  const existingSectionNames = existingSections.map((r) => r.name).filter(Boolean);

  let rooms: ExtractedSection[];
  try {
    const result = await extractRoomsFromTranscript(
      transcriptText, undefined, rendrContext,
      existingSectionNames.length > 0 ? existingSectionNames : undefined,
    );
    rooms = result.rooms ?? [];
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to extract rooms from transcript.";
    return { created: 0, updated: 0, skipped: 0, error: message };
  }

  // Fallback: rename AI-returned variant names to existing section names
  // e.g., "Living Room Kitchen Wall Opening" → "Living Room" if "Living Room" exists
  if (existingSectionNames.length > 0) {
    const existingNormalized = existingSectionNames.map((n) => ({
      original: n,
      normalized: normalizeRoomNameForCompare(n),
    }));
    for (const r of rooms) {
      const aiNorm = normalizeRoomNameForCompare(r.name ?? "");
      // Skip if it already matches an existing name exactly
      const exactMatch = existingNormalized.some((e) => e.normalized === aiNorm);
      if (exactMatch) continue;
      // Check if AI name contains an existing name (or vice versa)
      for (const e of existingNormalized) {
        if (aiNorm.includes(e.normalized) || e.normalized.includes(aiNorm)) {
          r.name = e.original;
          break;
        }
      }
    }
  }

  const existing = await prisma.room.findMany({
    where: { projectId },
    select: { id: true, name: true, measurementSource: true, scopeNarrative: true, roomDetail: true, sectionType: { select: { name: true } } },
  });
  const existingKeys = new Set(
    existing.map((r) => applyAlias(normalizeRoomNameForCompare(r.name), transcriptText))
  );
  // Map canonical name → existing room info (for Rendr scope-merge + recommended recalc)
  const existingRoomsByKey = new Map<string, { id: string; name: string; measurementSource: string | null; scopeNarrative: string | null; roomDetail: unknown; sectionTypeName: string | null }>();
  for (const r of existing) {
    const key = applyAlias(normalizeRoomNameForCompare(r.name), transcriptText);
    if (!existingRoomsByKey.has(key)) {
      existingRoomsByKey.set(key, { id: r.id, name: r.name, measurementSource: r.measurementSource, scopeNarrative: r.scopeNarrative, roomDetail: r.roomDetail, sectionTypeName: r.sectionType?.name ?? null });
    }
  }
  const { _max } = await prisma.room.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });
  const maxOrder = _max.sortOrder ?? -1;

  const roomTypeMap = await getRoomTypeNormalizedMap();
  const sectionTypeMap = await getSectionTypeNormalizedMap();
  const toCreate: {
    name: string;
    scopeNarrative: string;
    sortOrder: number;
    roomTypeId?: string;
    sectionTypeId?: string;
    lengthIn?: number | null;
    widthIn?: number | null;
    ceilingHeightIn?: number | null;
    areaSqFt?: number | null;
    fixtures?: ExtractedSection["fixtures"];
  }[] = [];
  // Rendr-created sections to update with AI scope or recalculate recommended detail
  const toUpdateScope: { id: string; scopeNarrative: string; skipScopeWrite?: boolean }[] = [];
  let nextOrder = maxOrder + 1;
  let skipped = 0;
  let loggedOneRoomDims = false;

  for (const r of rooms) {
    const rawName = (r.name ?? "").trim();
    const scopeNarrative = (r.scopeNarrative ?? "").trim();
    if (!rawName || !scopeNarrative) {
      skipped++;
      continue;
    }
    const canonicalName = applyAlias(normalizeRoomNameForCompare(rawName), transcriptText);
    if (existingKeys.has(canonicalName)) {
      // Check if this is a Rendr-created section — update scope or recalculate recommended
      const existingRoom = existingRoomsByKey.get(canonicalName);
      if (existingRoom?.measurementSource === "rendr" && !existingRoom.scopeNarrative?.trim()) {
        // No scope yet — write the AI-generated scope
        toUpdateScope.push({ id: existingRoom.id, scopeNarrative, skipScopeWrite: false });
      } else if (existingRoom?.measurementSource === "rendr" && existingRoom.roomDetail) {
        // Already has scope — just recalculate recommended detail using the EXISTING scope
        toUpdateScope.push({ id: existingRoom.id, scopeNarrative: existingRoom.scopeNarrative!, skipScopeWrite: true });
      } else {
        skipped++;
      }
      continue;
    }
    existingKeys.add(canonicalName);
    const name = displayNameForCanonical(canonicalName);
    const normalizedForMatch = normalizeRoomName(name);
    const roomTypeId = normalizedForMatch ? roomTypeMap.get(normalizedForMatch) : undefined;
    const sectionTypeId = normalizedForMatch ? sectionTypeMap.get(normalizedForMatch) : undefined;
    const lengthIn = r.lengthIn ?? null;
    const widthIn = r.widthIn ?? null;
    const ceilingHeightIn = r.ceilingHeightIn ?? null;
    const areaSqFt =
      lengthIn != null && widthIn != null && lengthIn > 0 && widthIn > 0
        ? Math.round((lengthIn / 12) * (widthIn / 12) * 100) / 100
        : null;
    if (!loggedOneRoomDims && (lengthIn != null || widthIn != null || ceilingHeightIn != null)) {
      if (process.env.NODE_ENV === "development") {
        console.log("[generateRoomsFromTranscript] sample room dims:", {
          name,
          lengthIn,
          widthIn,
          ceilingHeightIn,
          areaSqFt,
        });
      }
      loggedOneRoomDims = true;
    }
    toCreate.push({
      name,
      scopeNarrative,
      sortOrder: nextOrder++,
      roomTypeId,
      sectionTypeId,
      lengthIn,
      widthIn,
      ceilingHeightIn,
      areaSqFt,
      fixtures: r.fixtures ?? null,
    });
  }

  let unmatchedRooms: UnmatchedRoomItem[] = [];
  let createdRooms: { id: string; name: string; sectionTypeId: string | null }[] = [];
  if (toCreate.length > 0) {
    const created = await prisma.room.createManyAndReturn({
      data: toCreate.map((row) => ({
        projectId,
        name: row.name,
        scopeNarrative: row.scopeNarrative,
        scopeSource: "AI",
        scopeUpdatedAt: new Date(),
        sortOrder: row.sortOrder,
        roomTypeId: row.roomTypeId ?? null,
        sectionTypeId: row.sectionTypeId ?? null,
        lengthIn: row.lengthIn ?? null,
        widthIn: row.widthIn ?? null,
        ceilingHeightIn: row.ceilingHeightIn ?? null,
        areaSqFt: row.areaSqFt ?? null,
        origin: "AI_TRANSCRIPT",
        measurementSource: (row.lengthIn != null || row.widthIn != null) ? "transcript" : null,
      })),
    });
    createdRooms = created.map((r) => ({ id: r.id, name: r.name, sectionTypeId: r.sectionTypeId }));
    // Normalize new rooms to standalone-{id} slugs so each renders as its
    // own line item. User opts into a real group via the drag-merge popup.
    await dissolveSingleMemberGroups(projectId);
    const byName = new Map<string, string[]>();
    for (const room of created) {
      if (!room.sectionTypeId) {
        const arr = byName.get(room.name) ?? [];
        arr.push(room.id);
        byName.set(room.name, arr);
      }
    }
    unmatchedRooms = [...byName.entries()].map(([name, roomIds]) => ({ name, roomIds }));

    // Build roomDetail for Kitchen/Bath sections with transcript fixture data
    for (let i = 0; i < toCreate.length; i++) {
      const row = toCreate[i];
      const createdRoom = created[i];
      if (!createdRoom || !row.fixtures) continue;
      const sectionTypeName = row.sectionTypeId
        ? sectionTypeMap.entries().find(([, v]) => v === row.sectionTypeId)?.[0] ?? null
        : null;
      const roomType = classifyRoomForDetail(row.name, sectionTypeName);
      if (!roomType) continue;

      const f = row.fixtures;
      let detail: KitchenDetail | BathroomDetail;
      if (roomType === "kitchen") {
        detail = {
          baseCabinetCountExisting: f.baseCabinetCount ?? null,
          wallCabinetCountExisting: f.wallCabinetCount ?? null,
          sinkCountExisting: f.sinkCount ?? null,
          hasStoveExisting: f.appliances?.includes("stove") ?? null,
          hasOvenExisting: f.appliances?.includes("oven") ?? null,
          hasFridgeExisting: f.appliances?.includes("refrigerator") ?? null,
          hasDishwasherExisting: f.appliances?.includes("dishwasher") ?? null,
          existingSource: "transcript",
          baseCabinetCountRecommended: f.baseCabinetCount ?? null,
          wallCabinetCountRecommended: f.wallCabinetCount ?? null,
          sinkCountRecommended: f.sinkCount ?? null,
          hasStoveRecommended: f.appliances?.includes("stove") ?? null,
          hasOvenRecommended: f.appliances?.includes("oven") ?? null,
          hasFridgeRecommended: f.appliances?.includes("refrigerator") ?? null,
          hasDishwasherRecommended: f.appliances?.includes("dishwasher") ?? null,
          recommendedSource: "ai",
        };
      } else {
        detail = {
          vanityCabinetCountExisting: f.baseCabinetCount ?? null,
          sinkCountExisting: f.sinkCount ?? null,
          toiletCountExisting: f.toiletCount ?? null,
          hasTubExisting: f.hasTub ?? null,
          hasShowerExisting: f.hasShower ?? null,
          hasTubShowerComboExisting: f.hasTubShowerCombo ?? null,
          existingSource: "transcript",
          vanityCabinetCountRecommended: f.baseCabinetCount ?? null,
          sinkCountRecommended: f.sinkCount ?? null,
          toiletCountRecommended: f.toiletCount ?? null,
          hasTubRecommended: f.hasTub ?? null,
          hasShowerRecommended: f.hasShower ?? null,
          hasTubShowerComboRecommended: f.hasTubShowerCombo ?? null,
          recommendedSource: "ai",
        };
      }
      await prisma.room.update({
        where: { id: createdRoom.id },
        data: { roomDetail: detail as unknown as Prisma.InputJsonValue },
      });
    }
  }

  // Update scope on Rendr-created sections that matched transcript rooms,
  // then recalculate AI Recommended detail (awaited so results are visible on refresh)
  for (const update of toUpdateScope) {
    if (!update.skipScopeWrite) {
      await prisma.room.update({
        where: { id: update.id },
        data: {
          scopeNarrative: update.scopeNarrative,
          scopeSource: "AI",
          scopeUpdatedAt: new Date(),
        },
      });
    }

    const existingRoom = [...existingRoomsByKey.values()].find((r) => r.id === update.id);
    if (existingRoom) {
      const roomType = classifyRoomForDetail(existingRoom.name, existingRoom.sectionTypeName);
      if (roomType && existingRoom.roomDetail) {
        try {
          await generateRecommendedDetail(
            update.id,
            existingRoom.name,
            update.scopeNarrative,
            existingRoom.roomDetail as Record<string, unknown>,
            roomType,
          );
        } catch {
          // Best-effort — Recommended stays unchanged if this fails
        }
      }
    }
  }

  await ensureCopeRoom(projectId);

  // Auto-link Rendr measurements to newly created sections (best-effort)
  if (includeRendr && imperialTakeoff && createdRooms.length > 0) {
    try {
      await autoLinkRendrToSections(projectId, createdRooms, imperialTakeoff, geometryData);
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.log("[generateRooms] Rendr auto-link failed:", e);
      }
    }
  }

  // Fire-and-forget: generate AI recommended detail for Kitchen/Bath sections
  if (toCreate.length > 0) {
    for (let i = 0; i < toCreate.length; i++) {
      const row = toCreate[i];
      // Only for created rooms (not skipped ones), find by index
      const createdRoom = unmatchedRooms.length > 0 || toCreate.length > 0
        ? await prisma.room.findFirst({
            where: { projectId, name: row.name },
            select: { id: true, roomDetail: true, scopeNarrative: true, sectionType: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
          })
        : null;
      if (!createdRoom) continue;
      const roomType = classifyRoomForDetail(row.name, createdRoom.sectionType?.name);
      if (!roomType) continue;
      const detail = (createdRoom.roomDetail as Record<string, unknown>) ?? {};
      if (detail.recommendedSource === "manual") continue;
      // Non-blocking
      generateRecommendedDetail(
        createdRoom.id,
        row.name,
        row.scopeNarrative,
        detail,
        roomType,
      ).catch(() => {});
    }
  }

  // Auto-generate scope overview if rooms were created and project doesn't have one yet
  if (toCreate.length > 0) {
    try {
      const proj = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          scopeOverview: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          zip: true,
          client1First: true,
          client1Last: true,
        },
      });
      if (proj && !proj.scopeOverview) {
        const rooms = await prisma.room.findMany({
          where: { projectId, isProjectOverhead: false, scopeNarrative: { not: "" } },
          select: { name: true, scopeNarrative: true, bucket: true, sortOrder: true },
          orderBy: { sortOrder: "asc" },
        });
        if (rooms.length > 0) {
          const settings = await prisma.companySettings.findFirst({ select: { companyName: true } });
          const companyName = (settings?.companyName ?? "").trim() || "HHI Builders";
          const addressParts = [proj.addressLine1, proj.addressLine2, [proj.city, proj.state].filter(Boolean).join(", "), proj.zip].filter(Boolean);
          const projectAddress = addressParts.join(", ") || "Unknown Address";
          const clientName = [proj.client1First, proj.client1Last].filter(Boolean).join(" ") || "the homeowner";

          const scopeOverview = await generateScopeOverviewNarrative({ rooms, companyName, projectAddress, clientName });
          if (scopeOverview) {
            await prisma.project.update({ where: { id: projectId }, data: { scopeOverview } });
          }
        }
      }
    } catch {
      // Non-critical — scope overview can be generated later from Overview tab
    }
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return { created: toCreate.length, updated: toUpdateScope.length, skipped, unmatchedRooms: unmatchedRooms.length > 0 ? unmatchedRooms : undefined };
}

// ---------------------------------------------------------------------------
// Auto-link Rendr measurements to newly created sections via fuzzy matching
// ---------------------------------------------------------------------------

async function autoLinkRendrToSections(
  projectId: string,
  createdRooms: { id: string; name: string; sectionTypeId: string | null }[],
  imperialTakeoff: MergedTakeoffData,
  geometryData: GeometryData | null,
) {
  const rendrRooms = imperialTakeoff.rooms
    .filter((r) => r.label !== "All Rooms")
    .map((r) => ({ label: r.label, roomTakeoff: r.takeoff as unknown as import("@/app/lib/rendr/types").RendrRoomTakeoff }));

  const appRooms = createdRooms.map((r) => ({ id: r.id, name: r.name }));
  const matches = fuzzyMatchRooms(rendrRooms, appRooms);

  // Only auto-import high and suggested confidence matches
  const autoMatches = matches.filter(
    (m) => m.appRoomId && (m.confidence === "high" || m.confidence === "suggested"),
  );
  if (autoMatches.length === 0) return;

  // Build a lookup from label to imperial room (carrying its source space + the
  // per-space index that re-sync resolves against). Duplicate labels across
  // floors collapse to last-wins — the explicit matching-table import handles
  // those precisely; this fuzzy auto-link is best-effort.
  const imperialByLabel = new Map(
    imperialTakeoff.rooms.map((r) => [r.label, { takeoff: r.takeoff, spaceId: r.spaceId, indexInSpace: r.indexInSpace }]),
  );

  // Fetch section type names for room classification
  const sectionTypeIds = createdRooms.map((r) => r.sectionTypeId).filter(Boolean) as string[];
  const sectionTypeNames = new Map<string, string>();
  if (sectionTypeIds.length > 0) {
    const types = await prisma.sectionType.findMany({
      where: { id: { in: sectionTypeIds } },
      select: { id: true, name: true },
    });
    for (const t of types) sectionTypeNames.set(t.id, t.name);
  }

  for (const match of autoMatches) {
    if (!match.appRoomId) continue;
    const imperial = imperialByLabel.get(match.rendrLabel);
    if (!imperial) continue;
    const t = imperial.takeoff;

    const rendrRoomMappings = [{ spaceId: imperial.spaceId, index: imperial.indexInSpace, label: match.rendrLabel }];

    // Extract ceiling height from geometry
    const rendrCeilingFt = extractCeilingHeightForMappedRooms(geometryData, [match.rendrLabel]);

    // Build Kitchen/Bath roomDetail
    const appRoom = createdRooms.find((r) => r.id === match.appRoomId);
    const sectionTypeName = appRoom?.sectionTypeId ? sectionTypeNames.get(appRoom.sectionTypeId) ?? null : null;
    const roomType = appRoom ? classifyRoomForDetail(appRoom.name, sectionTypeName) : null;

    let roomDetail: Record<string, unknown> | null = null;
    if (roomType === "kitchen") {
      roomDetail = {
        baseCabinetCountExisting: t.numberOfBaseCabinets || null,
        baseCabinetLfExisting: t.baseCabinetsLF || null,
        wallCabinetCountExisting: t.numberOfWallCabinets || null,
        wallCabinetLfExisting: t.wallCabinetsLF || null,
        countertopSfExisting: t.countertopsSF || null,
        countertopLfExisting: t.countertopsLF || null,
        backsplashSfExisting: t.backsplashSF || null,
        backsplashLfExisting: t.backsplashLF || null,
        sinkCountExisting: t.numberOfSinks || null,
        hasStoveExisting: (t.numberOfStoves ?? 0) > 0,
        hasOvenExisting: (t.numberOfOvens ?? 0) > 0,
        hasFridgeExisting: (t.numberOfRefrigerators ?? 0) > 0,
        hasDishwasherExisting: (t.numberOfDishwashers ?? 0) > 0,
        existingSource: "rendr",
        baseCabinetCountRecommended: t.numberOfBaseCabinets || null,
        baseCabinetLfRecommended: t.baseCabinetsLF || null,
        wallCabinetCountRecommended: t.numberOfWallCabinets || null,
        wallCabinetLfRecommended: t.wallCabinetsLF || null,
        countertopSfRecommended: t.countertopsSF || null,
        backsplashSfRecommended: t.backsplashSF || null,
        sinkCountRecommended: t.numberOfSinks || null,
        hasStoveRecommended: false,
        hasOvenRecommended: false,
        hasFridgeRecommended: false,
        hasDishwasherRecommended: false,
        recommendedSource: null,
      };
    } else if (roomType === "bathroom") {
      roomDetail = {
        vanityCabinetCountExisting: t.numberOfBaseCabinets || null,
        vanityCabinetLfExisting: t.baseCabinetsLF || null,
        countertopSfExisting: t.countertopsSF || null,
        countertopLfExisting: t.countertopsLF || null,
        backsplashSfExisting: t.backsplashSF || null,
        backsplashLfExisting: t.backsplashLF || null,
        sinkCountExisting: t.numberOfSinks || null,
        toiletCountExisting: t.numberOfToilets || null,
        hasTubExisting: (t.numberOfBathtubs ?? 0) > 0,
        hasShowerExisting: false,
        hasTubShowerComboExisting: false,
        existingSource: "rendr",
        vanityCabinetCountRecommended: t.numberOfBaseCabinets || null,
        vanityCabinetLfRecommended: t.baseCabinetsLF || null,
        countertopSfRecommended: t.countertopsSF || null,
        backsplashSfRecommended: t.backsplashSF || null,
        sinkCountRecommended: t.numberOfSinks || null,
        toiletCountRecommended: t.numberOfToilets || null,
        hasTubRecommended: false,
        hasShowerRecommended: false,
        hasTubShowerComboRecommended: false,
        recommendedSource: null,
      };
    }

    await prisma.room.update({
      where: { id: match.appRoomId },
      data: {
        areaSqFt: t.floorSF,
        measurementMode: "AREA",
        wallsSF: t.wallsSF || null,
        ceilingSF: t.ceilingSF || null,
        perimeterLF: t.perimeterLF || null,
        paintableSF: t.paintableSF || null,
        windowCount: t.numberOfWindows || null,
        windowsSF: t.windowsSF || null,
        doorCount: t.numberOfDoors || null,
        doorsSF: t.doorsSF || null,
        measurementSource: "rendr",
        ...(rendrCeilingFt ? {
          ceilingHeightFt: rendrCeilingFt,
          rendrCeilingHeightFt: rendrCeilingFt,
          ceilingHeightIn: null,
        } : {}),
        rendrRoomMappings: rendrRoomMappings as unknown as Prisma.InputJsonValue,
        pricingNotes: buildPricingNotesSummary(t, rendrRoomMappings),
        ...(roomDetail ? { roomDetail: roomDetail as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  // Mark import on project
  await prisma.project.update({
    where: { id: projectId },
    data: { rendrImportedAt: new Date() },
  });

  if (process.env.NODE_ENV === "development") {
    console.log(`[generateRooms] Auto-linked ${autoMatches.length} sections to Rendr data`);
  }
}

export async function updateRoomScopesFromTranscriptAction(
  projectId: string,
  /**
   * Optional filter — when provided, only existing rooms whose IDs appear in
   * this list are updated. New-room creation is skipped entirely. The AI
   * still scans the full transcript so it can place context appropriately;
   * only the persistence step is narrowed.
   */
  targetRoomIds?: string[],
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  error?: string;
  unmatchedRooms?: UnmatchedRoomItem[];
}> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      transcriptText: true,
      stylePresetId: true,
      stylePreset: { select: { prompt: true } },
    },
  });
  if (!project) {
    return { created: 0, updated: 0, skipped: 0, error: "Project not found." };
  }
  const transcriptText = project.transcriptText?.trim() ?? "";
  if (!transcriptText) {
    return { created: 0, updated: 0, skipped: 0, error: "No transcript available." };
  }

  let stylePresetPrompt = "";
  if (project.stylePresetId && project.stylePreset?.prompt) {
    stylePresetPrompt = project.stylePreset.prompt;
  } else {
    const first = await prisma.stylePreset.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { prompt: true },
    });
    if (first) stylePresetPrompt = first.prompt;
  }

  // Fetch Rendr context if scan is linked (same logic as generateRoomsFromTranscriptAction)
  let rendrContext: string | null = null;
  const projectForRendr = await prisma.project.findUnique({
    where: { id: projectId },
    select: { rendrSpaces: true },
  });
  const rendrSpaceIdsForCtx = linkedSpaceIds(projectForRendr?.rendrSpaces);
  if (rendrSpaceIdsForCtx.length > 0) {
    try {
      // Merge rooms across all linked spaces (floors) for the AI context.
      const imperial = await fetchMergedTakeoff(rendrSpaceIdsForCtx);
      const primaryId = primaryLinkedSpaceId(projectForRendr?.rendrSpaces);
      let geo: GeometryData | null = null;
      if (primaryId != null) {
        try { geo = await getRendrSpaceGeometry(primaryId) as GeometryData | null; } catch {}
      }
      if (imperial) rendrContext = buildRendrContextForTranscript(imperial, geo);
    } catch {
      // Rendr context is best-effort
    }
  }

  // Fetch existing section names to pass to AI
  const existingSections = await prisma.room.findMany({
    where: { projectId, isProjectOverhead: false },
    select: { name: true },
  });
  const existingSectionNames = existingSections.map((r) => r.name).filter(Boolean);

  let roomsFromAi: ExtractedSection[];
  try {
    const result = await extractRoomsFromTranscript(
      transcriptText,
      stylePresetPrompt || undefined,
      rendrContext,
      existingSectionNames.length > 0 ? existingSectionNames : undefined,
    );
    roomsFromAi = result.rooms ?? [];
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to extract rooms from transcript.";
    return { created: 0, updated: 0, skipped: 0, error: message };
  }

  // Fallback: rename AI-returned variant names to existing section names
  if (existingSectionNames.length > 0) {
    const existingNormalized = existingSectionNames.map((n) => ({
      original: n,
      normalized: normalizeRoomNameForCompare(n),
    }));
    for (const r of roomsFromAi) {
      const aiNorm = normalizeRoomNameForCompare(r.name ?? "");
      const exactMatch = existingNormalized.some((e) => e.normalized === aiNorm);
      if (exactMatch) continue;
      for (const e of existingNormalized) {
        if (aiNorm.includes(e.normalized) || e.normalized.includes(aiNorm)) {
          r.name = e.original;
          break;
        }
      }
    }
  }

  const existingRooms = await prisma.room.findMany({
    where: { projectId },
    select: { id: true, name: true, sortOrder: true, lengthIn: true, widthIn: true, ceilingHeightIn: true, roomDetail: true, measurementSource: true, sectionType: { select: { name: true, defaultMeasurementMode: true, defaultEstimateUnit: true } } },
  });

  const canonicalToExisting = new Map<string, { id: string }>();
  for (const room of existingRooms) {
    const canonical = applyAlias(normalizeRoomNameForCompare(room.name), transcriptText);
    if (!canonicalToExisting.has(canonical)) {
      canonicalToExisting.set(canonical, { id: room.id });
    }
  }

  const { _max } = await prisma.room.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });
  let nextOrder = (_max.sortOrder ?? -1) + 1;

  const roomTypeMap = await getRoomTypeNormalizedMap();
  const sectionTypeMap = await getSectionTypeNormalizedMap();
  const toUpdate: { id: string; scopeNarrative: string; lengthIn?: number | null; widthIn?: number | null; ceilingHeightIn?: number | null }[] = [];
  const toCreate: {
    name: string;
    scopeNarrative: string;
    sortOrder: number;
    roomTypeId?: string;
    sectionTypeId?: string;
    lengthIn?: number | null;
    widthIn?: number | null;
    ceilingHeightIn?: number | null;
    areaSqFt?: number | null;
  }[] = [];
  let updated = 0;
  let skipped = 0;
  const seenCanonicals = new Set<string>();

  // When a target filter is set, narrow persistence to those rooms only.
  const targetSet = targetRoomIds && targetRoomIds.length > 0 ? new Set(targetRoomIds) : null;

  for (const r of roomsFromAi) {
    const rawName = (r.name ?? "").trim();
    const scopeNarrative = (r.scopeNarrative ?? "").trim();
    if (!rawName || !scopeNarrative) {
      skipped++;
      continue;
    }

    const canonicalName = applyAlias(normalizeRoomNameForCompare(rawName), transcriptText);

    if (seenCanonicals.has(canonicalName)) {
      skipped++;
      continue;
    }
    seenCanonicals.add(canonicalName);

    const existingRoom = existingRooms.find((x) => x.id === canonicalToExisting.get(canonicalName)?.id);
    const existing = canonicalToExisting.get(canonicalName);
    if (existing) {
      // Honor the optional filter — skip rooms not in targetRoomIds.
      if (targetSet && !targetSet.has(existing.id)) {
        skipped++;
        continue;
      }
      const lengthIn = r.lengthIn != null && existingRoom?.lengthIn == null ? r.lengthIn : existingRoom?.lengthIn ?? null;
      const widthIn = r.widthIn != null && existingRoom?.widthIn == null ? r.widthIn : existingRoom?.widthIn ?? null;
      const ceilingHeightIn = r.ceilingHeightIn != null && existingRoom?.ceilingHeightIn == null ? r.ceilingHeightIn : existingRoom?.ceilingHeightIn ?? null;
      toUpdate.push({
        id: existing.id,
        scopeNarrative,
        lengthIn,
        widthIn,
        ceilingHeightIn,
      });
      updated++;
    } else if (targetSet) {
      // Filter active — never create new rooms; just skip unmatched AI sections.
      skipped++;
      continue;
    } else {
      const name = displayNameForCanonical(canonicalName);
      const normalizedForMatch = normalizeRoomName(name);
      const roomTypeId = normalizedForMatch ? roomTypeMap.get(normalizedForMatch) : undefined;
      const sectionTypeId = normalizedForMatch ? sectionTypeMap.get(normalizedForMatch) : undefined;
      const lengthIn = r.lengthIn ?? null;
      const widthIn = r.widthIn ?? null;
      const ceilingHeightIn = r.ceilingHeightIn ?? null;
      const areaSqFt =
        lengthIn != null && widthIn != null && lengthIn > 0 && widthIn > 0
          ? Math.round((lengthIn / 12) * (widthIn / 12) * 100) / 100
          : null;
      toCreate.push({
        name,
        scopeNarrative,
        sortOrder: nextOrder++,
        roomTypeId,
        sectionTypeId,
        lengthIn,
        widthIn,
        ceilingHeightIn,
        areaSqFt,
      });
    }
  }

  let unmatchedRooms: UnmatchedRoomItem[] = [];
  if (toCreate.length > 0) {
    const created = await prisma.room.createManyAndReturn({
      data: toCreate.map((row) => ({
        projectId,
        name: row.name,
        scopeNarrative: row.scopeNarrative,
        scopeSource: "AI",
        scopeUpdatedAt: new Date(),
        sortOrder: row.sortOrder,
        roomTypeId: row.roomTypeId ?? null,
        sectionTypeId: row.sectionTypeId ?? null,
        lengthIn: row.lengthIn ?? null,
        widthIn: row.widthIn ?? null,
        ceilingHeightIn: row.ceilingHeightIn ?? null,
        areaSqFt: row.areaSqFt ?? null,
        origin: "AI_TRANSCRIPT",
        measurementSource: (row.lengthIn != null || row.widthIn != null) ? "transcript" : null,
      })),
    });
    // Normalize new rooms to standalone-{id} slugs.
    await dissolveSingleMemberGroups(projectId);
    const byName = new Map<string, string[]>();
    for (const room of created) {
      if (!room.sectionTypeId) {
        const arr = byName.get(room.name) ?? [];
        arr.push(room.id);
        byName.set(room.name, arr);
      }
    }
    unmatchedRooms = [...byName.entries()].map(([name, roomIds]) => ({ name, roomIds }));
  }

  if (toUpdate.length > 0) {
    const roomsToUpdate = await prisma.room.findMany({
      where: { id: { in: toUpdate.map((u) => u.id) } },
      include: { sectionType: { select: { defaultMeasurementMode: true, defaultEstimateUnit: true } } },
    });
    const roomMap = new Map(roomsToUpdate.map((room) => [room.id, room]));
    const updateOps: Promise<unknown>[] = toUpdate.map((u) => {
      const room = roomMap.get(u.id);
      const data: {
        scopeNarrative: string;
        scopeSource: string;
        scopeUpdatedAt: Date;
        lengthIn?: number | null;
        widthIn?: number | null;
        ceilingHeightIn?: number | null;
        areaSqFt?: number | null;
        unitQuantity?: number | null;
        totalLow?: number | null;
        totalTarget?: number | null;
        totalHigh?: number | null;
      } = {
        scopeNarrative: u.scopeNarrative,
        scopeSource: "AI",
        scopeUpdatedAt: new Date(),
      };
      if (u.lengthIn != null) data.lengthIn = u.lengthIn;
      if (u.widthIn != null) data.widthIn = u.widthIn;
      if (u.ceilingHeightIn != null) data.ceilingHeightIn = u.ceilingHeightIn;
      const effectiveMode = room?.measurementMode ?? room?.sectionType?.defaultMeasurementMode ?? null;
      if (
        room &&
        room.areaSqFt == null &&
        (effectiveMode === "AREA" || effectiveMode === "DIMENSIONS") &&
        u.lengthIn != null &&
        u.widthIn != null &&
        u.lengthIn > 0 &&
        u.widthIn > 0
      ) {
        data.areaSqFt = Math.round((u.lengthIn / 12) * (u.widthIn / 12) * 100) / 100;
      }
      // Do not overwrite rates or pricingNotes; only recompute totals when unitQuantity changes
      if (room && !room.unitQuantityManualOverride) {
        const merged: RoomLikeForUnitQuantity = { ...room, lengthIn: u.lengthIn, widthIn: u.widthIn, areaSqFt: data.areaSqFt ?? room.areaSqFt };
        const newUnitQty = computeUnitQuantity(merged, room.sectionType?.defaultMeasurementMode ?? null);
        data.unitQuantity = newUnitQty;
        const totals = computeSectionTotals(
          {
            estimateUnit: room.estimateUnit,
            unitQuantity: newUnitQty,
            unitRateLow: room.unitRateLow,
            unitRateTarget: room.unitRateTarget,
            unitRateHigh: room.unitRateHigh,
          },
          room.sectionType
        );
        data.totalLow = totals.totalLow;
        data.totalTarget = totals.totalTarget;
        data.totalHigh = totals.totalHigh;
      }
      return prisma.room.update({ where: { id: u.id }, data });
    });
    await Promise.all(updateOps);

    // Recalculate AI Recommended detail for Kitchen/Bath sections that got scope updates
    for (const u of toUpdate) {
      const room = existingRooms.find((r) => r.id === u.id);
      if (!room) continue;
      const roomType = classifyRoomForDetail(room.name, room.sectionType?.name);
      if (roomType && room.roomDetail) {
        try {
          await generateRecommendedDetail(
            u.id,
            room.name,
            u.scopeNarrative,
            room.roomDetail as Record<string, unknown>,
            roomType,
          );
        } catch {
          // Best-effort
        }
      }
    }
  }
  await recomputeInvestmentRollups(projectId);

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {
    created: toCreate.length,
    updated,
    skipped,
    unmatchedRooms: unmatchedRooms.length > 0 ? unmatchedRooms : undefined,
  };
}

/** Resolve effective style preset for AI: project.stylePresetId else room.stylePresetId else first active. */
async function getEffectiveStylePresetPrompt(
  projectStylePresetId: string | null,
  projectStylePreset: { prompt: string } | null,
  roomStylePresetId: string | null,
  roomStylePreset: { prompt: string } | null
): Promise<string> {
  const projectId = projectStylePresetId ?? null;
  const roomId = roomStylePresetId ?? null;
  let effectiveId: string | null = projectId ?? roomId;
  if (!effectiveId) {
    const first = await prisma.stylePreset.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, prompt: true },
    });
    if (first) return first.prompt;
    return "";
  }
  if (effectiveId === projectId && projectStylePreset) return projectStylePreset.prompt;
  if (effectiveId === roomId && roomStylePreset) return roomStylePreset.prompt;
  const preset = await prisma.stylePreset.findUnique({
    where: { id: effectiveId },
    select: { prompt: true },
  });
  return preset?.prompt ?? "";
}

export async function rewriteRoomScopeAction(
  projectId: string,
  roomId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      transcriptText: true,
      stylePresetId: true,
      stylePreset: { select: { prompt: true } },
    },
  });
  if (!project) return { error: "Project not found." };
  const transcriptText = project.transcriptText?.trim() ?? "";
  if (!transcriptText) return { error: "No transcript available." };

  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    select: {
      id: true,
      name: true,
      scopeNarrative: true,
      stylePresetId: true,
      stylePreset: { select: { prompt: true } },
      // Rendr fields for AI context
      measurementSource: true,
      areaSqFt: true,
      wallsSF: true,
      ceilingSF: true,
      perimeterLF: true,
      paintableSF: true,
      windowCount: true,
      windowsSF: true,
      doorCount: true,
      doorsSF: true,
      roomDetail: true,
    },
  });
  if (!room) return { error: "Room not found." };

  const stylePresetPrompt = await getEffectiveStylePresetPrompt(
    project.stylePresetId,
    project.stylePreset,
    room.stylePresetId,
    room.stylePreset
  );

  // Build Rendr measurement context for AI
  const rendrContext = buildRendrContextString(room);

  let newNarrative: string;
  try {
    // Append Rendr context to transcript so AI has measurement data
    const enrichedTranscript = rendrContext
      ? `${transcriptText}\n\n${rendrContext}`
      : transcriptText;

    newNarrative = await rewriteRoomScopeNarrative(
      enrichedTranscript,
      room.name,
      room.scopeNarrative ?? "",
      stylePresetPrompt || undefined
    );
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to rewrite scope.";
    return { error: message };
  }

  await prisma.room.update({
    where: { id: roomId },
    data: {
      scopeNarrative: newNarrative,
      scopeSource: "AI",
      scopeUpdatedAt: new Date(),
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/** Legacy hook: no-op for now; front-end computes combined area from base room + sub-areas. */
async function recomputeRoomAreaFromSubAreas(_roomId: string): Promise<void> {
  return;
}

export async function mergeRoomsWithAiAction(
  projectId: string,
  roomIds: string[],
  mergedName: string
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    const trimmedIds = Array.from(new Set(roomIds.filter((id) => !!id)));
    if (trimmedIds.length < 2) {
      return { error: "Select at least two sections to merge." };
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        transcriptText: true,
        stylePresetId: true,
        stylePreset: { select: { prompt: true } },
      },
    });
    if (!project) return { error: "Project not found." };

    const transcriptText = project.transcriptText?.trim() ?? "";

    const rooms = await prisma.room.findMany({
      where: {
        projectId,
        id: { in: trimmedIds },
      },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        scopeNarrative: true,
        lengthIn: true,
        widthIn: true,
        ceilingHeightIn: true,
        areaSqFt: true,
        totalLow: true,
        totalTarget: true,
        totalHigh: true,
      },
    });

    if (rooms.length < 2) {
      return { error: "Could not find enough sections to merge for this project." };
    }

    const stylePresetPrompt =
      project.stylePresetId && project.stylePreset?.prompt
        ? project.stylePreset.prompt
        : "";

    let mergedScope: string;
    try {
      mergedScope = await mergeRoomScopesNarrative(
        transcriptText,
        mergedName,
        rooms.map((r) => ({
          name: r.name,
          scopeNarrative: r.scopeNarrative ?? "",
        })),
        stylePresetPrompt || undefined
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to merge scopes with AI.";
      return { error: message };
    }

    const target = rooms[0];
    const now = new Date();
    const remainingIds = rooms.slice(1).map((r) => r.id);

    const sum = (field: "totalLow" | "totalTarget" | "totalHigh"): number | null => {
      const values = rooms
        .map((r) => r[field])
        .filter((v): v is number => v != null);
      if (!values.length) return null;
      return values.reduce((a, b) => a + b, 0);
    };

    const totalLow = sum("totalLow");
    const totalTarget = sum("totalTarget");
    const totalHigh = sum("totalHigh");

    await prisma.$transaction(async (tx) => {
      const baseArea =
        target.lengthIn != null &&
        target.widthIn != null &&
        target.lengthIn > 0 &&
        target.widthIn > 0
          ? (target.lengthIn / 12) * (target.widthIn / 12)
          : 0;
      const subAreasToCreate = rooms
        .filter((r) => remainingIds.includes(r.id))
        .map((r, index) => {
          const areaSqFt =
            r.lengthIn != null &&
            r.widthIn != null &&
            r.lengthIn > 0 &&
            r.widthIn > 0
              ? (r.lengthIn / 12) * (r.widthIn / 12)
              : r.areaSqFt && !Number.isNaN(r.areaSqFt) && r.areaSqFt > 0
                ? r.areaSqFt
                : 0;
          return {
            roomId: target.id,
            name: r.name,
            lengthIn: r.lengthIn,
            widthIn: r.widthIn,
            ceilingHeightIn: r.ceilingHeightIn,
            areaSqFt: areaSqFt > 0 ? Math.round(areaSqFt * 100) / 100 : null,
            includeInArea: true,
            sortOrder: index,
          };
        });
      const extraArea = subAreasToCreate
        .map((s) => s.areaSqFt ?? 0)
        .filter((v) => Number.isFinite(v) && v > 0)
        .reduce((a, b) => a + b, 0);
      const combinedArea = baseArea + extraArea;

      // Clean up AI estimates from all merged rooms (sectionId has no FK cascade)
      const allMergedIds = rooms.map((r) => r.id);
      await tx.aIEstimate.deleteMany({
        where: { sectionId: { in: allMergedIds } },
      });

      await tx.room.update({
        where: { id: target.id },
        data: {
          name: mergedName || target.name,
          scopeNarrative: mergedScope,
          scopeSource: "MANUAL",
          scopeUpdatedAt: now,
          scopeQA: Prisma.DbNull, // Clear Q&A to force fresh review after merge
          estimateStaleReason: "Rooms merged — scope and dimensions changed. Regenerate estimate.",
          // Keep primary room's dimensions; only adjust areaSqFt
          areaSqFt: combinedArea > 0 ? Math.round(combinedArea * 100) / 100 : target.areaSqFt,
          totalLow,
          totalTarget,
          totalHigh,
        },
      });

      if (subAreasToCreate.length) {
        await tx.roomSubArea.createMany({
          data: subAreasToCreate,
        });
      }

      if (remainingIds.length) {
        await tx.room.deleteMany({
          where: { id: { in: remainingIds } },
        });
        // Merging destroys rooms; any existing COPE AIEstimate could be tied
        // to one of the now-deleted rooms (sectionId has no FK cascade). Reset
        // the COPE lock inside the same transaction so the user never sees
        // "project overhead ready" pointing at a deleted section. See
        // PHASE_9_AIESTIMATE_FK_CLEANUP.md for the broader fix.
        await tx.project.update({
          where: { id: projectId },
          data: { copeStatus: "IDLE", copeGeneratedAt: null, copeError: null },
        });
      }
    });

    // Ensure areaSqFt on the merged room matches its own dimensions plus included sub-areas.
    await recomputeRoomAreaFromSubAreas(target.id);

    await recomputeInvestmentRollups(projectId);
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/preview`);
    return {};
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[mergeRoomsWithAiAction] Unexpected error", e);
    return {
      error:
        e instanceof Error
          ? e.message || "Unexpected error while merging sections."
          : "Unexpected error while merging sections.",
    };
  }
}

type RoomSubAreaFormInput = {
  id?: string | null;
  name?: string;
  length?: string;
  width?: string;
  ceilingHeight?: string;
  includeInArea?: boolean;
};

/** Update a room's sub-areas from the main Sections page editor. */
export async function updateRoomSubAreasAction(
  projectId: string,
  roomId: string,
  subAreas: RoomSubAreaFormInput[]
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    select: { id: true },
  });
  if (!room) return { error: "Room not found" };

  type SubAreaForPersist = {
    id?: string;
    name: string;
    lengthIn: number | null;
    widthIn: number | null;
    ceilingHeightIn: number | null;
    areaSqFt: number | null;
    includeInArea: boolean;
    sortOrder: number;
  };

  const toPersist: SubAreaForPersist[] = [];
  let sortOrder = 0;
  for (const sa of subAreas ?? []) {
    const name = (sa.name ?? "").trim();
    const lengthStr = (sa.length ?? "").trim();
    const widthStr = (sa.width ?? "").trim();
    const ceilingStr = (sa.ceilingHeight ?? "").trim();
    const includeInArea = !!sa.includeInArea;
    if (!name && !lengthStr && !widthStr && !ceilingStr) continue;

    let lengthIn: number | null = null;
    let widthIn: number | null = null;
    let ceilingHeightIn: number | null = null;

    if (lengthStr) {
      const parsed = parseFeetInchesToInches(lengthStr);
      if (!parsed.error && parsed.inches != null) lengthIn = parsed.inches;
    }
    if (widthStr) {
      const parsed = parseFeetInchesToInches(widthStr);
      if (!parsed.error && parsed.inches != null) widthIn = parsed.inches;
    }
    if (ceilingStr) {
      const parsed = parseFeetInchesToInches(ceilingStr);
      if (!parsed.error && parsed.inches != null) ceilingHeightIn = parsed.inches;
    }

    let areaSqFt: number | null = null;
    if (lengthIn != null && widthIn != null && lengthIn > 0 && widthIn > 0) {
      areaSqFt = Math.round(((lengthIn / 12) * (widthIn / 12)) * 100) / 100;
    }

    toPersist.push({
      id: sa.id && sa.id.trim() ? sa.id.trim() : undefined,
      name: name || "Sub-area",
      lengthIn,
      widthIn,
      ceilingHeightIn,
      areaSqFt,
      includeInArea,
      sortOrder: sortOrder++,
    });
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.roomSubArea.findMany({
      where: { roomId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((sa) => sa.id));
    const incomingIds = new Set(
      toPersist.map((sa) => sa.id).filter((id): id is string => !!id)
    );

    const deleteIds = [...existingIds].filter((id) => !incomingIds.has(id));
    if (deleteIds.length) {
      await tx.roomSubArea.deleteMany({
        where: { id: { in: deleteIds } },
      });
    }

    for (const sa of toPersist) {
      if (sa.id && existingIds.has(sa.id)) {
        await tx.roomSubArea.update({
          where: { id: sa.id },
          data: {
            name: sa.name,
            lengthIn: sa.lengthIn,
            widthIn: sa.widthIn,
            ceilingHeightIn: sa.ceilingHeightIn,
            areaSqFt: sa.areaSqFt,
            includeInArea: sa.includeInArea,
            sortOrder: sa.sortOrder,
          },
        });
      } else {
        await tx.roomSubArea.create({
          data: {
            roomId,
            name: sa.name,
            lengthIn: sa.lengthIn,
            widthIn: sa.widthIn,
            ceilingHeightIn: sa.ceilingHeightIn,
            areaSqFt: sa.areaSqFt,
            includeInArea: sa.includeInArea,
            sortOrder: sa.sortOrder,
          },
        });
      }
    }
  });

  // Flag estimate as stale when sub-areas change (affects dimensions/area)
  const hasEstimate = await prisma.aIEstimate.findFirst({
    where: { sectionId: roomId },
    select: { id: true },
  });
  if (hasEstimate) {
    await prisma.room.update({
      where: { id: roomId },
      data: { estimateStaleReason: "Sub-areas modified after estimate" },
    });
  }

  await recomputeRoomAreaFromSubAreas(roomId);
  await recomputeInvestmentRollups(projectId);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/** Create a RoomType or return existing one (case-insensitive name). Enforces unique name. */
export async function createRoomType(name: string, exterior: boolean): Promise<{ roomTypeId?: string; error?: string }> {
  await requireAdmin();
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { error: "Name is required" };
  const normalized = normalizeRoomName(trimmed);
  const all = await prisma.roomType.findMany({ select: { id: true, name: true } });
  const existingByNorm = all.find((t) => normalizeRoomName(t.name) === normalized);
  if (existingByNorm) {
    return { roomTypeId: existingByNorm.id };
  }
  const maxOrder = await prisma.roomType.aggregate({ _max: { sortOrder: true } }).then((r) => r._max.sortOrder ?? -1);
  const created = await prisma.roomType.create({
    data: {
      name: trimmed,
      sortOrder: maxOrder + 1,
      active: true,
      exterior,
    },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/projects");
  return { roomTypeId: created.id };
}

/** Set roomTypeId on the given rooms. Pass null for roomTypeId to clear (Custom). */
export async function updateRoomsRoomType(
  roomIds: string[],
  roomTypeId: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!roomIds.length) return {};
  await prisma.room.updateMany({
    where: { id: { in: roomIds } },
    data: { roomTypeId },
  });
  revalidatePath("/admin/projects");
  const project = await prisma.room.findFirst({
    where: { id: roomIds[0] },
    select: { projectId: true },
  });
  if (project) {
    revalidatePath(`/admin/projects/${project.projectId}`);
    revalidatePath(`/admin/projects/${project.projectId}/preview`);
  }
  return {};
}

/** Set sectionTypeId (Pricing Profile) on the given rooms. Pass null to clear. */
export async function updateRoomsSectionType(
  roomIds: string[],
  sectionTypeId: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!roomIds.length) return {};
  await prisma.room.updateMany({
    where: { id: { in: roomIds } },
    data: { sectionTypeId },
  });
  revalidatePath("/admin/projects");
  const project = await prisma.room.findFirst({
    where: { id: roomIds[0] },
    select: { projectId: true },
  });
  if (project) {
    revalidatePath(`/admin/projects/${project.projectId}`);
    revalidatePath(`/admin/projects/${project.projectId}/preview`);
    await recomputeInvestmentRollups(project.projectId);
  }
  return {};
}

export type NewRoomTypeResolution = {
  name: string;
  roomIds: string[];
  /** Map to existing Pricing Profile (SectionType). */
  sectionTypeId?: string;
  /** Create a new SectionType and assign it. */
  createNew?: { exterior: boolean; name?: string };
};

/** Apply mappings/creates from the Unmatched sections modal. Stores mapping on Room.sectionTypeId (Pricing Profile). */
export async function bulkResolveNewRoomTypes(
  projectId: string,
  resolutions: NewRoomTypeResolution[]
): Promise<{ error?: string }> {
  await requireAdmin();
  for (const res of resolutions) {
    if (!res.roomIds.length) continue;
    let sectionTypeId: string | undefined;
    if (res.sectionTypeId) {
      sectionTypeId = res.sectionTypeId;
    } else if (res.createNew) {
      const nameToUse = res.createNew.name?.trim() || res.name;
      const out = await getOrCreateSectionTypeForName(nameToUse, res.createNew.exterior);
      if (out.error) return { error: out.error };
      sectionTypeId = out.sectionTypeId;
    }
    if (sectionTypeId) {
      await updateRoomsSectionType(res.roomIds, sectionTypeId);
    }
  }
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/** Get existing SectionType by normalized name or create one (INTERIOR/EXTERIOR, AREA, SF). */
async function getOrCreateSectionTypeForName(
  name: string,
  exterior: boolean
): Promise<{ sectionTypeId?: string; error?: string }> {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { error: "Name is required" };
  const category = exterior ? "EXTERIOR" : "INTERIOR";
  const existing = await prisma.sectionType.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { sectionTypeId: existing.id };
  const created = await prisma.sectionType.create({
    data: {
      name: trimmed,
      category,
      defaultMeasurementMode: "AREA",
      defaultEstimateUnit: "SF",
    },
  });
  return { sectionTypeId: created.id };
}

/** Quick-create a Pricing Profile (SectionType) with name, pricing basis, and optional target price. */
export async function updateRoomManualPriceAction(
  projectId: string,
  roomId: string,
  low: number | null,
  high: number | null
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    const target = low != null && high != null ? Math.round((low + high) / 2) : low ?? high ?? null;
    await prisma.room.update({
      where: { id: roomId },
      data: {
        totalLow: low,
        totalTarget: target,
        totalHigh: high,
        pricingTier: "MANUAL",
      },
    });
    await recomputeInvestmentRollups(projectId);
    revalidatePath(`/admin/projects/${projectId}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update manual price" };
  }
}

export async function updateRoomPricingTierAction(
  projectId: string,
  roomId: string,
  pricingTier: "PROFILE" | "AI_ESTIMATE" | "MANUAL"
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await prisma.room.update({
      where: { id: roomId },
      data: { pricingTier },
    });
    await recomputeInvestmentRollups(projectId);
    revalidatePath(`/admin/projects/${projectId}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update pricing tier" };
  }
}

export async function createQuickSectionTypeAction(
  name: string,
  exterior: boolean,
  pricingBasis: string,
  priceTarget: number | null
): Promise<{ sectionTypeId?: string; error?: string }> {
  await requireAdmin();
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { error: "Name is required" };
  const normalizedBasis =
    pricingBasis === "PER_SF" || pricingBasis === "PER_EACH" || pricingBasis === "PER_JOB"
      ? pricingBasis
      : "NONE";
  const category = exterior ? "EXTERIOR" : "INTERIOR";
  const existing = await prisma.sectionType.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return { sectionTypeId: existing.id };
  }
  const created = await prisma.sectionType.create({
    data: {
      name: trimmed,
      category,
      pricingBasis: normalizedBasis as any,
      defaultMeasurementMode: "AREA",
      defaultEstimateUnit: "SF",
      priceTarget: priceTarget ?? undefined,
    },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/projects");
  return { sectionTypeId: created.id };
}

export async function updateProjectDefaultCeilingHeightAction(
  projectId: string,
  heightFt: number,
): Promise<{ error?: string }> {
  await requireAdmin();
  if (heightFt < 6 || heightFt > 20) {
    return { error: "Ceiling height must be between 6 and 20 feet." };
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { defaultCeilingHeightFt: heightFt },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  return {};
}
