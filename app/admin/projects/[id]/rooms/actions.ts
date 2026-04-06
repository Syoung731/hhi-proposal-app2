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
import {
  extractRoomsFromTranscript,
  rewriteRoomScopeNarrative,
  mergeRoomScopesNarrative,
} from "@/app/lib/ai/extract-from-transcript";
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
  await prisma.room.create({
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
  });
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
  const dimsChanged =
    lengthIn !== room.lengthIn ||
    widthIn !== room.widthIn ||
    ceilingHeightIn !== room.ceilingHeightIn;
  if (scopeChanged || dimsChanged) {
    const hasEstimate = await prisma.aIEstimate.findFirst({
      where: { sectionId: roomId },
      select: { id: true },
    });
    if (hasEstimate) {
      const reason = scopeChanged && dimsChanged
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
    if (dimsChanged) {
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
  await prisma.room.deleteMany({ where: { projectId } });
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

export async function generateRoomsFromTranscriptAction(projectId: string): Promise<{
  created: number;
  skipped: number;
  error?: string;
  unmatchedRooms?: UnmatchedRoomItem[];
}> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, transcriptText: true },
  });
  if (!project) {
    return { created: 0, skipped: 0, error: "Project not found." };
  }
  const transcriptText = project.transcriptText?.trim() ?? "";
  if (!transcriptText) {
    return { created: 0, skipped: 0, error: "No transcript available." };
  }

  let rooms: ExtractedSection[];
  try {
    const result = await extractRoomsFromTranscript(transcriptText);
    rooms = result.rooms ?? [];
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to extract rooms from transcript.";
    return { created: 0, skipped: 0, error: message };
  }

  const existing = await prisma.room.findMany({
    where: { projectId },
    select: { name: true },
  });
  const existingKeys = new Set(
    existing.map((r) => applyAlias(normalizeRoomNameForCompare(r.name), transcriptText))
  );
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
  }[] = [];
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
      skipped++;
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
    });
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
      })),
    });
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

  await ensureCopeRoom(projectId);

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return { created: toCreate.length, skipped, unmatchedRooms: unmatchedRooms.length > 0 ? unmatchedRooms : undefined };
}

export async function updateRoomScopesFromTranscriptAction(projectId: string): Promise<{
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

  let roomsFromAi: ExtractedSection[];
  try {
    const result = await extractRoomsFromTranscript(
      transcriptText,
      stylePresetPrompt || undefined
    );
    roomsFromAi = result.rooms ?? [];
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to extract rooms from transcript.";
    return { created: 0, updated: 0, skipped: 0, error: message };
  }

  const existingRooms = await prisma.room.findMany({
    where: { projectId },
    select: { id: true, name: true, sortOrder: true, lengthIn: true, widthIn: true, ceilingHeightIn: true },
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
      })),
    });
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
    },
  });
  if (!room) return { error: "Room not found." };

  const stylePresetPrompt = await getEffectiveStylePresetPrompt(
    project.stylePresetId,
    project.stylePreset,
    room.stylePresetId,
    room.stylePreset
  );

  let newNarrative: string;
  try {
    newNarrative = await rewriteRoomScopeNarrative(
      transcriptText,
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
