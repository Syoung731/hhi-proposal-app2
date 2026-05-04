"use server";

import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@/app/generated/prisma";
import { revalidatePath } from "next/cache";
import { aggregateRendrTakeoffs } from "@/app/lib/rendr/aggregateTakeoffs";
import { getRendrTakeoffData, getRendrSpaceGeometry } from "@/app/lib/rendr/rendrClient";
import { convertTakeoffData } from "@/app/lib/rendr/convertTakeoff";
import type { ImperialRoomTakeoff } from "@/app/lib/rendr/types";
import { classifyRoomForDetail, type RoomDetail } from "@/app/lib/room-classification";
import { extractCeilingHeightForMappedRooms } from "@/app/lib/rendr/extractCeilingHeight";
import { computeUnitQuantity } from "@/app/lib/section-unit-quantity";
import { computeSectionTotals } from "@/app/lib/section-totals";
import { dissolveSingleMemberGroups } from "@/app/lib/investment/assign-display-group";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RendrRoomMapping = {
  index: number; // Index in the Rendr TakeOff rooms array
  label: string; // Rendr's label (e.g. "Primary Bathroom", "Toilet Room")
};

type ImportMapping = {
  rendrRoomIndex: number;
  floorSF: number;
} & (
  | { appRoomId: string; sectionTypeId?: undefined; sectionTypeName?: undefined; pendingKey?: undefined }
  | { appRoomId?: undefined; sectionTypeId: string; sectionTypeName: string; pendingKey: string }
);

// ---------------------------------------------------------------------------
// Link / Unlink
// ---------------------------------------------------------------------------

export async function linkRendrProject(
  appProjectId: string,
  rendrProjectId: number | null,
  rendrSpaceId: number,
) {
  await requireAdmin();
  await prisma.project.update({
    where: { id: appProjectId },
    data: {
      rendrProjectId,
      rendrSpaceId,
      rendrLinkedAt: new Date(),
      rendrImportedAt: null,
    },
  });
  revalidatePath(`/admin/projects/${appProjectId}`);
}

export async function unlinkRendrProject(appProjectId: string) {
  await requireAdmin();
  await prisma.project.update({
    where: { id: appProjectId },
    data: {
      rendrProjectId: null,
      rendrSpaceId: null,
      rendrLinkedAt: null,
      rendrImportedAt: null,
    },
  });

  // Clear Rendr mappings on all sections but KEEP measurement data
  await prisma.room.updateMany({
    where: { projectId: appProjectId },
    data: {
      rendrRoomMappings: Prisma.DbNull,
      // DO NOT clear wallsSF, areaSqFt, etc. — historical data preserved
      // DO NOT clear measurementSource — it's a historical record
    },
  });

  revalidatePath(`/admin/projects/${appProjectId}`);
}

// ---------------------------------------------------------------------------
// Import measurements (supports many-to-one Rendr → section mapping)
// ---------------------------------------------------------------------------

export async function importRendrMeasurements(
  appProjectId: string,
  mappings: ImportMapping[],
) {
  await requireAdmin();

  // Fetch full takeoff data server-side
  const project = await prisma.project.findUnique({
    where: { id: appProjectId },
    select: { rendrSpaceId: true },
  });
  if (!project?.rendrSpaceId) throw new Error("No Rendr scan linked.");

  // Get imperial takeoff data
  const raw = await getRendrTakeoffData(project.rendrSpaceId);
  const takeoff = convertTakeoffData(raw);

  // Fetch geometry blob for wall dimensions / ceiling height (best-effort)
  let geometryData: Record<string, unknown> | null = null;
  try {
    geometryData = (await getRendrSpaceGeometry(project.rendrSpaceId)) as Record<string, unknown> | null;
  } catch { /* best-effort */ }

  // Resolve mappings — existing-section mappings pass through; section-type
  // mappings are grouped by pendingKey so multiple Rendr rooms targeted at the
  // same pending bucket converge into a single newly-created Room.
  const resolvedMappings: (ImportMapping & { appRoomId: string })[] = [];
  const { _max: sortMax } = await prisma.room.aggregate({
    where: { projectId: appProjectId },
    _max: { sortOrder: true },
  });
  let nextSortOrder = (sortMax.sortOrder ?? -1) + 1;

  // Pass 1: existing-section mappings go through unchanged; pending-section
  // mappings get bucketed by pendingKey.
  type PendingBucket = {
    sectionTypeId: string;
    sectionTypeName: string;
    members: ImportMapping[];
  };
  const pendingBucketsMap = new Map<string, PendingBucket>();
  for (const m of mappings) {
    if (m.appRoomId !== undefined) {
      resolvedMappings.push(m as ImportMapping & { appRoomId: string });
      continue;
    }
    const sectionTypeId = m.sectionTypeId;
    const sectionTypeName = m.sectionTypeName;
    if (!sectionTypeId || !sectionTypeName) continue;
    // Fall back to a per-mapping unique key if pendingKey is missing (older
    // clients) so behavior matches the legacy "one new room per pick".
    const key = m.pendingKey || `auto-${m.rendrRoomIndex}`;
    const bucket = pendingBucketsMap.get(key);
    if (bucket) {
      bucket.members.push(m);
    } else {
      pendingBucketsMap.set(key, {
        sectionTypeId,
        sectionTypeName,
        members: [m],
      });
    }
  }

  // Number buckets per section type so two "+ Bathroom" picks land as
  // "Bathroom 1" and "Bathroom 2" instead of two same-named rooms.
  const totalBySectionType = new Map<string, number>();
  for (const bucket of pendingBucketsMap.values()) {
    totalBySectionType.set(
      bucket.sectionTypeId,
      (totalBySectionType.get(bucket.sectionTypeId) ?? 0) + 1,
    );
  }
  const seenIndexBySectionType = new Map<string, number>();

  // Pass 2: create one Room per pending bucket, using aggregated floor SF for
  // pricing (totals are not recomputed by the later groupedBySection update).
  for (const bucket of pendingBucketsMap.values()) {
    const sectionType = await prisma.sectionType.findUnique({
      where: { id: bucket.sectionTypeId },
      select: {
        defaultMeasurementMode: true,
        defaultEstimateUnit: true,
        pricingBasis: true,
        priceLow: true,
        priceTarget: true,
        priceHigh: true,
      },
    });

    // Compute the room's display name: append "1", "2", ... only when 2+ buckets share a section type
    const totalForType = totalBySectionType.get(bucket.sectionTypeId) ?? 1;
    const idxForType = (seenIndexBySectionType.get(bucket.sectionTypeId) ?? 0) + 1;
    seenIndexBySectionType.set(bucket.sectionTypeId, idxForType);
    const roomName = totalForType > 1 ? `${bucket.sectionTypeName} ${idxForType}` : bucket.sectionTypeName;

    const aggregateFloorSF = bucket.members.reduce((sum, m) => sum + (m.floorSF || 0), 0);
    const unitQuantity = computeUnitQuantity(
      { measurementMode: "AREA", areaSqFt: aggregateFloorSF },
      sectionType?.defaultMeasurementMode ?? null,
    );

    let unitRateLow: number | null = null;
    let unitRateTarget: number | null = null;
    let unitRateHigh: number | null = null;
    let forceQtyOne = false;
    const basis = sectionType?.pricingBasis ?? "NONE";
    if (basis === "PER_SF" || basis === "PER_EACH") {
      unitRateLow = sectionType?.priceLow ?? null;
      unitRateTarget = sectionType?.priceTarget ?? null;
      unitRateHigh = sectionType?.priceHigh ?? null;
    } else if (basis === "PER_JOB") {
      unitRateLow = sectionType?.priceLow ?? null;
      unitRateTarget = sectionType?.priceTarget ?? null;
      unitRateHigh = sectionType?.priceHigh ?? null;
      forceQtyOne = true;
    }

    const effectiveQty = forceQtyOne ? 1 : unitQuantity;

    const totals = computeSectionTotals(
      {
        estimateUnit: sectionType?.defaultEstimateUnit ?? null,
        unitQuantity: effectiveQty,
        unitRateLow,
        unitRateTarget,
        unitRateHigh,
      },
      sectionType ? { defaultEstimateUnit: sectionType.defaultEstimateUnit } : null,
    );

    const newRoom = await prisma.room.create({
      data: {
        projectId: appProjectId,
        name: roomName,
        sectionTypeId: bucket.sectionTypeId,
        scopeNarrative: "",
        scopeSource: "RENDR",
        sortOrder: nextSortOrder++,
        origin: "IMPORTED",
        measurementSource: "rendr",
        measurementMode: "AREA",
        areaSqFt: aggregateFloorSF,
        estimateUnit: sectionType?.defaultEstimateUnit ?? undefined,
        unitQuantity: effectiveQty,
        unitRateLow,
        unitRateTarget,
        unitRateHigh,
        totalLow: totals.totalLow,
        totalTarget: totals.totalTarget,
        totalHigh: totals.totalHigh,
      },
    });
    // New rooms start ungrouped — user opts into a group via the drag-merge
    // popup in the Investment tab.

    for (const m of bucket.members) {
      resolvedMappings.push({
        rendrRoomIndex: m.rendrRoomIndex,
        floorSF: m.floorSF,
        appRoomId: newRoom.id,
      });
    }
  }

  // Group mappings by app section ID (supports many Rendr rooms → one section)
  const groupedBySection = new Map<string, (ImportMapping & { appRoomId: string })[]>();
  for (const m of resolvedMappings) {
    const group = groupedBySection.get(m.appRoomId) || [];
    group.push(m);
    groupedBySection.set(m.appRoomId, group);
  }

  // Fetch section info for classification
  const sectionInfoMap = new Map<string, { name: string; sectionTypeName: string | null; existingDetail: Record<string, unknown> | null }>();
  const sectionIds = [...groupedBySection.keys()];
  if (sectionIds.length > 0) {
    const sections = await prisma.room.findMany({
      where: { id: { in: sectionIds } },
      select: { id: true, name: true, sectionType: { select: { name: true } }, roomDetail: true },
    });
    for (const s of sections) {
      sectionInfoMap.set(s.id, {
        name: s.name,
        sectionTypeName: s.sectionType?.name ?? null,
        existingDetail: s.roomDetail as Record<string, unknown> | null,
      });
    }
  }

  for (const [appRoomId, sectionMappings] of groupedBySection) {
    // Collect all Rendr rooms for this section
    const rendrRooms: { index: number; label: string; takeoff: ImperialRoomTakeoff }[] = [];
    for (const m of sectionMappings) {
      const room = takeoff.rooms[m.rendrRoomIndex];
      if (!room) continue;
      rendrRooms.push({
        index: m.rendrRoomIndex,
        label: room.label,
        takeoff: room.takeoff,
      });
    }
    if (rendrRooms.length === 0) continue;

    // Always go through the aggregator so single-room takeoffs also get
    // rounded to 0.1 precision (Rendr's API can return drifted floats too).
    const t = aggregateRendrTakeoffs(rendrRooms.map((r) => r.takeoff));

    // Build the mapping array for persistence
    const rendrRoomMappings: RendrRoomMapping[] = rendrRooms.map((r) => ({
      index: r.index,
      label: r.label,
    }));

    // Build Kitchen/Bath roomDetail from Rendr data
    const sectionInfo = sectionInfoMap.get(appRoomId);
    const roomType = sectionInfo
      ? classifyRoomForDetail(sectionInfo.name, sectionInfo.sectionTypeName)
      : null;
    const existingDetail = (sectionInfo?.existingDetail ?? {}) as Record<string, unknown>;
    const isManualRec = existingDetail.recommendedSource === "manual";

    let roomDetail: RoomDetail | null = null;
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
        // Recommended: preserve manual edits, otherwise default to Existing
        baseCabinetCountRecommended: isManualRec ? (existingDetail.baseCabinetCountRecommended as number ?? null) : (t.numberOfBaseCabinets || null),
        baseCabinetLfRecommended: isManualRec ? (existingDetail.baseCabinetLfRecommended as number ?? null) : (t.baseCabinetsLF || null),
        wallCabinetCountRecommended: isManualRec ? (existingDetail.wallCabinetCountRecommended as number ?? null) : (t.numberOfWallCabinets || null),
        wallCabinetLfRecommended: isManualRec ? (existingDetail.wallCabinetLfRecommended as number ?? null) : (t.wallCabinetsLF || null),
        countertopSfRecommended: isManualRec ? (existingDetail.countertopSfRecommended as number ?? null) : (t.countertopsSF || null),
        backsplashSfRecommended: isManualRec ? (existingDetail.backsplashSfRecommended as number ?? null) : (t.backsplashSF || null),
        sinkCountRecommended: isManualRec ? (existingDetail.sinkCountRecommended as number ?? null) : (t.numberOfSinks || null),
        hasStoveRecommended: isManualRec ? (existingDetail.hasStoveRecommended as boolean ?? false) : false,
        hasOvenRecommended: isManualRec ? (existingDetail.hasOvenRecommended as boolean ?? false) : false,
        hasFridgeRecommended: isManualRec ? (existingDetail.hasFridgeRecommended as boolean ?? false) : false,
        hasDishwasherRecommended: isManualRec ? (existingDetail.hasDishwasherRecommended as boolean ?? false) : false,
        recommendedSource: isManualRec ? "manual" : null,
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
        vanityCabinetCountRecommended: isManualRec ? (existingDetail.vanityCabinetCountRecommended as number ?? null) : (t.numberOfBaseCabinets || null),
        vanityCabinetLfRecommended: isManualRec ? (existingDetail.vanityCabinetLfRecommended as number ?? null) : (t.baseCabinetsLF || null),
        countertopSfRecommended: isManualRec ? (existingDetail.countertopSfRecommended as number ?? null) : (t.countertopsSF || null),
        backsplashSfRecommended: isManualRec ? (existingDetail.backsplashSfRecommended as number ?? null) : (t.backsplashSF || null),
        sinkCountRecommended: isManualRec ? (existingDetail.sinkCountRecommended as number ?? null) : (t.numberOfSinks || null),
        toiletCountRecommended: isManualRec ? (existingDetail.toiletCountRecommended as number ?? null) : (t.numberOfToilets || null),
        hasTubRecommended: isManualRec ? (existingDetail.hasTubRecommended as boolean ?? false) : false,
        hasShowerRecommended: isManualRec ? (existingDetail.hasShowerRecommended as boolean ?? false) : false,
        hasTubShowerComboRecommended: isManualRec ? (existingDetail.hasTubShowerComboRecommended as boolean ?? false) : false,
        recommendedSource: isManualRec ? "manual" : null,
      };
    }

    // Extract ceiling height from geometry blob
    const rendrLabels = rendrRooms.map((r) => r.label);
    const rendrCeilingFt = extractCeilingHeightForMappedRooms(
      geometryData,
      rendrLabels,
    );
    if (process.env.NODE_ENV === "development") {
      console.log("[Rendr Import] Ceiling extraction for labels:", rendrLabels, "→", rendrCeilingFt, "ft");
    }

    await prisma.room.update({
      where: { id: appRoomId },
      data: {
        // Floor area
        areaSqFt: t.floorSF,
        measurementMode: "AREA",

        // Structured measurement fields (Phase 7A)
        wallsSF: t.wallsSF || null,
        ceilingSF: t.ceilingSF || null,
        perimeterLF: t.perimeterLF || null,
        paintableSF: t.paintableSF || null,
        windowCount: t.numberOfWindows || null,
        windowsSF: t.windowsSF || null,
        doorCount: t.numberOfDoors || null,
        doorsSF: t.doorsSF || null,
        measurementSource: "rendr",

        // Ceiling height from geometry blob
        ...(rendrCeilingFt ? {
          ceilingHeightFt: rendrCeilingFt,
          rendrCeilingHeightFt: rendrCeilingFt,
          ceilingHeightIn: null, // Clear to prevent additive bug
        } : {}),

        // Rendr mapping — array of all mapped Rendr rooms
        rendrRoomMappings,

        // Human-readable summary (kept for display, no longer source of truth)
        pricingNotes: buildPricingNotesSummary(t, rendrRoomMappings),

        // Kitchen/Bath structured detail (Phase 7B)
        ...(roomDetail ? { roomDetail: roomDetail as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  // Mark import complete
  await prisma.project.update({
    where: { id: appProjectId },
    data: { rendrImportedAt: new Date() },
  });

  // Normalize new rooms to standalone-{id} slugs.
  await dissolveSingleMemberGroups(appProjectId);

  revalidatePath(`/admin/projects/${appProjectId}`);
  return { importedCount: groupedBySection.size };
}

// ---------------------------------------------------------------------------
// Re-sync from Rendr (uses stored mappings — no re-matching needed)
// ---------------------------------------------------------------------------

export type ResyncDiff = {
  roomId: string;
  roomName: string;
  wasManuallyEdited: boolean;
  changes: { field: string; current: number | null; updated: number | null }[];
};

export async function previewRendrResync(appProjectId: string): Promise<ResyncDiff[]> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: appProjectId },
    select: { rendrSpaceId: true },
  });
  if (!project?.rendrSpaceId) throw new Error("No Rendr scan linked.");

  const raw = await getRendrTakeoffData(project.rendrSpaceId);
  const takeoff = convertTakeoffData(raw);

  // Find all sections with Rendr mappings
  const sections = await prisma.room.findMany({
    where: {
      projectId: appProjectId,
      rendrRoomMappings: { not: Prisma.DbNull },
    },
    select: {
      id: true,
      name: true,
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
      rendrRoomMappings: true,
    },
  });

  const diffs: ResyncDiff[] = [];

  for (const section of sections) {
    const mappings = section.rendrRoomMappings as RendrRoomMapping[];
    if (!mappings || mappings.length === 0) continue;

    // Aggregate fresh takeoff data
    const takeoffs: ImperialRoomTakeoff[] = [];
    for (const m of mappings) {
      const room = takeoff.rooms[m.index];
      if (room) takeoffs.push(room.takeoff);
    }
    if (takeoffs.length === 0) continue;

    const t =
      takeoffs.length === 1
        ? takeoffs[0]
        : aggregateRendrTakeoffs(takeoffs);

    const changes: ResyncDiff["changes"] = [];
    const compare = (field: string, current: number | null, updated: number | null) => {
      if (current !== updated) {
        changes.push({ field, current, updated });
      }
    };

    compare("Floor SF", section.areaSqFt, t.floorSF || null);
    compare("Walls SF", section.wallsSF, t.wallsSF || null);
    compare("Ceiling SF", section.ceilingSF, t.ceilingSF || null);
    compare("Perimeter LF", section.perimeterLF, t.perimeterLF || null);
    compare("Paintable SF", section.paintableSF, t.paintableSF || null);
    compare("Windows", section.windowCount, t.numberOfWindows || null);
    compare("Windows SF", section.windowsSF, t.windowsSF || null);
    compare("Doors", section.doorCount, t.numberOfDoors || null);
    compare("Doors SF", section.doorsSF, t.doorsSF || null);

    if (changes.length > 0) {
      diffs.push({
        roomId: section.id,
        roomName: section.name,
        wasManuallyEdited: section.measurementSource === "manual",
        changes,
      });
    }
  }

  return diffs;
}

export async function executeRendrResync(
  appProjectId: string,
  roomIdsToSync: string[],
): Promise<{ syncedCount: number }> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: appProjectId },
    select: { rendrSpaceId: true },
  });
  if (!project?.rendrSpaceId) throw new Error("No Rendr scan linked.");

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/rendr/spaces/${project.rendrSpaceId}/takeoff`,
  );
  if (!res.ok) throw new Error("Failed to fetch takeoff data");
  const takeoff = await res.json();

  // Fetch geometry blob for ceiling heights (best-effort)
  let geometryDataResync: Record<string, unknown> | null = null;
  try {
    const geoRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/rendr/spaces/${project.rendrSpaceId}/geometry`,
    );
    if (geoRes.ok) geometryDataResync = await geoRes.json();
  } catch { /* best-effort */ }

  const sections = await prisma.room.findMany({
    where: {
      projectId: appProjectId,
      id: { in: roomIdsToSync },
      rendrRoomMappings: { not: Prisma.DbNull },
    },
    select: { id: true, rendrRoomMappings: true },
  });

  let syncedCount = 0;

  for (const section of sections) {
    const mappings = section.rendrRoomMappings as RendrRoomMapping[];
    if (!mappings || mappings.length === 0) continue;

    const takeoffs: ImperialRoomTakeoff[] = [];
    for (const m of mappings) {
      const room = takeoff.rooms[m.index];
      if (room) takeoffs.push(room.takeoff);
    }
    if (takeoffs.length === 0) continue;

    const t =
      takeoffs.length === 1
        ? takeoffs[0]
        : aggregateRendrTakeoffs(takeoffs);

    // Extract ceiling height from geometry
    const rendrCeilingFt = extractCeilingHeightForMappedRooms(
      geometryDataResync,
      mappings.map((m) => m.label),
    );

    await prisma.room.update({
      where: { id: section.id },
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
          ceilingHeightIn: null, // Clear to prevent additive bug
        } : {}),
        pricingNotes: buildPricingNotesSummary(t, mappings),
      },
    });
    syncedCount++;
  }

  await prisma.project.update({
    where: { id: appProjectId },
    data: { rendrImportedAt: new Date() },
  });

  revalidatePath(`/admin/projects/${appProjectId}`);
  return { syncedCount };
}

// ---------------------------------------------------------------------------
// Data migration for existing Rendr-imported sections (Phase 7A backfill)
// ---------------------------------------------------------------------------

export async function migrateRendrPricingNotes(): Promise<{ migratedCount: number }> {
  await requireAdmin();

  const sections = await prisma.room.findMany({
    where: {
      pricingNotes: { startsWith: "LiDAR Import:" },
      measurementSource: null,
    },
    select: { id: true, pricingNotes: true },
  });

  let migratedCount = 0;

  for (const section of sections) {
    const notes = section.pricingNotes || "";
    const parsed = parseRendrPricingNotes(notes);

    await prisma.room.update({
      where: { id: section.id },
      data: {
        wallsSF: parsed.wallsSF,
        ceilingSF: parsed.ceilingSF,
        perimeterLF: parsed.perimeterLF,
        paintableSF: parsed.paintableSF,
        windowCount: parsed.windowCount,
        windowsSF: parsed.windowsSF,
        doorCount: parsed.doorCount,
        doorsSF: parsed.doorsSF,
        measurementSource: "rendr",
      },
    });
    migratedCount++;
  }

  return { migratedCount };
}

function parseRendrPricingNotes(notes: string) {
  const floatMatch = (pattern: RegExp) => {
    const m = notes.match(pattern);
    return m ? parseFloat(m[1]) : null;
  };
  const intMatch = (pattern: RegExp) => {
    const m = notes.match(pattern);
    return m ? parseInt(m[1], 10) : null;
  };

  return {
    wallsSF: floatMatch(/Walls (\d+\.?\d*) SF/),
    ceilingSF: floatMatch(/Ceiling (\d+\.?\d*) SF/),
    perimeterLF: floatMatch(/Perimeter (\d+\.?\d*) LF/),
    paintableSF: floatMatch(/Paintable (\d+\.?\d*) SF/),
    windowCount: intMatch(/Windows: (\d+)/),
    windowsSF: floatMatch(/Windows: \d+ \((\d+\.?\d*) SF\)/),
    doorCount: intMatch(/Doors: (\d+)/),
    doorsSF: floatMatch(/Doors: \d+ \((\d+\.?\d*) SF\)/),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPricingNotesSummary(
  t: ImperialRoomTakeoff,
  mappings: RendrRoomMapping[],
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
