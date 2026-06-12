/**
 * Fetch and merge Rendr takeoff data across multiple linked spaces.
 *
 * A Project may link several Rendr spaces (one scan per floor). Callers that
 * want a single combined view of every room — the AI estimate / transcript
 * Rendr-context builders — use this to concatenate each space's rooms into one
 * ImperialTakeoffData. Each merged room is tagged with its source `spaceId` so
 * downstream consumers can still attribute a room to its floor.
 *
 * Server-side only (calls the Rendr API). Best-effort per space: a space that
 * fails to fetch is skipped rather than failing the whole merge.
 */

import { getRendrTakeoffData } from "@/app/lib/rendr/rendrClient";
import { convertTakeoffData } from "@/app/lib/rendr/convertTakeoff";
import type { ImperialTakeoffData, ImperialRoom } from "@/app/lib/rendr/types";

export type MergedImperialRoom = ImperialRoom & {
  /** Source Rendr space (floor) this room was scanned in. */
  spaceId: number;
  /** Index of this room within its own space's rooms array (for re-sync mapping). */
  indexInSpace: number;
};

export type MergedTakeoffData = Omit<ImperialTakeoffData, "rooms"> & {
  rooms: MergedImperialRoom[];
};

/**
 * Fetch takeoff for each space id and concatenate their rooms. Returns null when
 * no space yields data. `spaceTakeoff` / flex-file metadata come from the first
 * space that resolves (only the merged `rooms` list is meaningful across spaces).
 */
export async function fetchMergedTakeoff(
  spaceIds: number[],
): Promise<MergedTakeoffData | null> {
  if (spaceIds.length === 0) return null;

  let base: ImperialTakeoffData | null = null;
  const rooms: MergedImperialRoom[] = [];

  for (const spaceId of spaceIds) {
    try {
      const raw = await getRendrTakeoffData(spaceId);
      const imperial = convertTakeoffData(raw);
      if (!base) base = imperial;
      imperial.rooms.forEach((room, indexInSpace) => {
        rooms.push({ ...room, spaceId, indexInSpace });
      });
    } catch {
      // Best-effort: skip a space that fails to fetch.
    }
  }

  if (!base) return null;
  return { ...base, rooms };
}
