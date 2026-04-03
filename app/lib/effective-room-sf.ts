import { prisma } from "@/app/lib/prisma";

export interface EffectiveRoomMetrics {
  effectiveSqFt: number;        // base + included sub-areas
  baseSqFt: number;             // room dimensions only
  subAreaSqFt: number;          // sum of included sub-areas
  effectivePerimeterLF: number; // base perimeter + sub-area perimeters
  basePerimeterLF: number;
  wallSF: number | null;        // effectivePerimeterLF * ceilingHeight (null if no height)
  ceilingHeightFt: number;      // room ceiling || project default || 9
}

export async function getEffectiveRoomMetrics(
  roomId: string,
  projectDefaultCeilingFt?: number | null,
): Promise<EffectiveRoomMetrics> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { subAreas: true },
  });

  if (!room) throw new Error(`Room not found: ${roomId}`);

  return computeMetricsFromRoom(room, projectDefaultCeilingFt);
}

/** Batch version for COPE aggregate (avoids N+1 queries). */
export async function getEffectiveProjectSF(
  projectId: string,
  projectDefaultCeilingFt?: number | null,
): Promise<{ totalEffectiveSqFt: number; roomMetrics: Map<string, EffectiveRoomMetrics> }> {
  const rooms = await prisma.room.findMany({
    where: { projectId, isProjectOverhead: false },
    include: { subAreas: true },
  });

  const roomMetrics = new Map<string, EffectiveRoomMetrics>();
  let totalEffectiveSqFt = 0;

  for (const room of rooms) {
    const metrics = computeMetricsFromRoom(room, projectDefaultCeilingFt);
    roomMetrics.set(room.id, metrics);
    totalEffectiveSqFt += metrics.effectiveSqFt;
  }

  return { totalEffectiveSqFt, roomMetrics };
}

// ---------------------------------------------------------------------------
// Shared computation (no DB calls)
// ---------------------------------------------------------------------------

interface RoomLike {
  lengthFt: number | null;
  widthFt: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  ceilingHeightFt: number | null;
  ceilingHeightIn: number | null;
  areaSqFt: number | null;
  subAreas: {
    includeInArea: boolean;
    areaSqFt: number | null;
    lengthIn: number | null;
    widthIn: number | null;
  }[];
}

function computeMetricsFromRoom(
  room: RoomLike,
  projectDefaultCeilingFt?: number | null,
): EffectiveRoomMetrics {
  // Base room SF from dimensions
  const lengthFt = (room.lengthFt || 0) + (room.lengthIn || 0) / 12;
  const widthFt = (room.widthFt || 0) + (room.widthIn || 0) / 12;
  const baseSqFt = room.areaSqFt || (lengthFt * widthFt) || 0;
  const basePerimeterLF =
    lengthFt > 0 && widthFt > 0 ? 2 * (lengthFt + widthFt) : 0;

  // Sub-areas where includeInArea is true
  const includedSubAreas = (room.subAreas || []).filter((sa) => sa.includeInArea);
  const subAreaSqFt = includedSubAreas.reduce(
    (sum, sa) => sum + (sa.areaSqFt || 0),
    0,
  );

  // Sub-area perimeters
  const subAreaPerimeterLF = includedSubAreas.reduce((sum, sa) => {
    const saLengthFt = (sa.lengthIn || 0) / 12;
    const saWidthFt = (sa.widthIn || 0) / 12;
    return sum + (saLengthFt > 0 && saWidthFt > 0 ? 2 * (saLengthFt + saWidthFt) : 0);
  }, 0);

  // Effective totals
  const effectiveSqFt = baseSqFt + subAreaSqFt;
  const effectivePerimeterLF = basePerimeterLF + subAreaPerimeterLF;

  // Ceiling height: room-specific > project default > 9ft
  const roomCeilingFt =
    (room.ceilingHeightFt || 0) + (room.ceilingHeightIn || 0) / 12;
  const ceilingHeightFt =
    roomCeilingFt > 0 ? roomCeilingFt : (projectDefaultCeilingFt || 9);

  // Wall SF
  const wallSF =
    effectivePerimeterLF > 0 ? effectivePerimeterLF * ceilingHeightFt : null;

  return {
    effectiveSqFt,
    baseSqFt,
    subAreaSqFt,
    effectivePerimeterLF,
    basePerimeterLF,
    wallSF,
    ceilingHeightFt,
  };
}
