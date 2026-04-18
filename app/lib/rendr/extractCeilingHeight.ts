/**
 * Extract ceiling height from Rendr geometry blob.
 * The geometry blob contains per-wall rawSize [width, height] in meters,
 * and rooms link to their walls via roomTakeoff.wallIdentifiers.
 */

const METERS_TO_FEET = 3.28084;

interface GeometryWall {
  id: string;
  label: string;
  rawSize: [number, number]; // [width_m, height_m]
}

interface GeometryRoom {
  label: string;
  roomTakeoff?: {
    wallIdentifiers?: string[];
  };
}

export interface GeometryData {
  space?: {
    rooms?: GeometryRoom[];
    walls?: GeometryWall[];
  };
}

/**
 * Extract ceiling height (in feet) for a specific Rendr room label.
 * Uses the median wall height of walls belonging to that room.
 * Returns null if data is unavailable.
 */
export function extractCeilingHeightFt(
  geometryData: GeometryData | null,
  rendrRoomLabel: string,
): number | null {
  // Defensive: accept any shape and navigate carefully
  const geoAny = geometryData as Record<string, unknown> | null;
  const space = geoAny?.space as { rooms?: GeometryRoom[]; walls?: GeometryWall[] } | undefined;
  if (!space?.rooms || !space?.walls) return null;

  // Find the matching room in geometry data
  const geoRoom = space.rooms.find(
    (r) => r.label === rendrRoomLabel && r.label !== "All Rooms",
  );
  if (!geoRoom?.roomTakeoff?.wallIdentifiers) return null;

  // Build wall lookup
  const wallById = new Map<string, GeometryWall>();
  for (const w of space.walls) {
    wallById.set(w.id, w);
  }

  // Collect wall heights for this room
  const heights: number[] = [];
  for (const wid of geoRoom.roomTakeoff.wallIdentifiers) {
    const wall = wallById.get(wid);
    if (wall?.rawSize?.[1] && wall.rawSize[1] > 0) {
      heights.push(wall.rawSize[1]); // height in meters
    }
  }

  if (heights.length === 0) return null;

  // Use MEDIAN height (handles rooms with mixed wall heights like vaulted ceilings)
  const sorted = [...heights].sort((a, b) => a - b);
  const medianM = sorted[Math.floor(sorted.length / 2)];

  // Convert meters to feet, round to nearest 0.5 ft
  const rawFt = medianM * METERS_TO_FEET;
  return Math.round(rawFt * 2) / 2; // e.g., 7.98 → 8.0, 9.35 → 9.5
}

/**
 * Extract ceiling height for multiple mapped Rendr rooms (many-to-one).
 * Returns the maximum ceiling height across all rooms (conservative).
 */
export function extractCeilingHeightForMappedRooms(
  geometryData: GeometryData | null,
  rendrRoomLabels: string[],
): number | null {
  if (!geometryData || rendrRoomLabels.length === 0) return null;

  const heights = rendrRoomLabels
    .map((label) => extractCeilingHeightFt(geometryData, label))
    .filter((h): h is number => h !== null);

  return heights.length > 0 ? Math.max(...heights) : null;
}
