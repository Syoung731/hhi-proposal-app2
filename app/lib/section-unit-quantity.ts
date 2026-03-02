/**
 * Deterministic unitQuantity computation for Sections (Room model).
 * Used server-side on section create/update. Do not overwrite when unitQuantityManualOverride is true.
 */

import type { MeasurementMode } from "@/app/generated/prisma";

const NONE: MeasurementMode = "NONE";
const DIMENSIONS: MeasurementMode = "DIMENSIONS";
const AREA: MeasurementMode = "AREA";
const COUNT: MeasurementMode = "COUNT";

/** Room-like shape with fields needed for unitQuantity. Supports partial (e.g. merged update). */
export type RoomLikeForUnitQuantity = {
  measurementMode?: MeasurementMode | null;
  lengthFt?: number | null;
  widthFt?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  areaSqFt?: number | null;
  quantity?: number | null;
};

/**
 * effectiveMode = measurementMode ?? sectionType.defaultMeasurementMode ?? NONE
 */
export function getEffectiveMeasurementMode(
  room: RoomLikeForUnitQuantity,
  sectionTypeDefaultMode: MeasurementMode | null | undefined
): MeasurementMode {
  return room.measurementMode ?? sectionTypeDefaultMode ?? NONE;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compute unitQuantity from room data and section type default mode.
 * - effectiveMode = measurementMode ?? sectionType.defaultMeasurementMode ?? NONE
 * - DIMENSIONS: length = lengthFt + (lengthIn/12), width = widthFt + (widthIn/12); if both present → round(length*width, 2); else null
 * - AREA: unitQuantity = round(areaSqFt, 2)
 * - COUNT: unitQuantity = quantity (as float)
 * - NONE: unitQuantity = null
 * Never uses height for area.
 */
export function computeUnitQuantity(
  room: RoomLikeForUnitQuantity,
  sectionTypeDefaultMode: MeasurementMode | null | undefined
): number | null {
  const effectiveMode = getEffectiveMeasurementMode(room, sectionTypeDefaultMode);

  switch (effectiveMode) {
    case DIMENSIONS: {
      const lengthFt = room.lengthFt ?? 0;
      const lengthIn = room.lengthIn ?? 0;
      const widthFt = room.widthFt ?? 0;
      const widthIn = room.widthIn ?? 0;
      const length = lengthFt + lengthIn / 12;
      const width = widthFt + widthIn / 12;
      const lengthPresent = length > 0 || lengthFt !== 0 || lengthIn !== 0;
      const widthPresent = width > 0 || widthFt !== 0 || widthIn !== 0;
      if (lengthPresent && widthPresent && length > 0 && width > 0) {
        return round2(length * width);
      }
      return null;
    }
    case AREA: {
      const area = room.areaSqFt;
      if (area != null && !Number.isNaN(area)) {
        return round2(area);
      }
      return null;
    }
    case COUNT: {
      const q = room.quantity;
      if (q != null && !Number.isNaN(q)) {
        return Number(q);
      }
      return null;
    }
    case NONE:
    default:
      return null;
  }
}
