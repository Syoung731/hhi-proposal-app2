/**
 * Deterministic Section (Room) totals from unitQuantity and unit rates.
 * Used when persisting room/section so totals stay consistent with qty and rates.
 *
 * Rules:
 * - effectiveUnit = estimateUnit ?? sectionType.defaultEstimateUnit ?? SF
 * - qty = unitQuantity, unless (effectiveUnit === CUSTOM && (unitQuantity is null or <= 0)) then qty = 1
 * - totalLow = unitRateLow != null ? round(unitRateLow * qty, 0) : null
 * - totalTarget = unitRateTarget != null ? round(unitRateTarget * qty, 0) : null
 * - totalHigh = unitRateHigh != null ? round(unitRateHigh * qty, 0) : null
 */

import type { EstimateUnit } from "@/app/generated/prisma";

const SF: EstimateUnit = "SF";
const CUSTOM: EstimateUnit = "CUSTOM";

export type RoomLikeForTotals = {
  estimateUnit?: EstimateUnit | null;
  unitQuantity?: number | null;
  unitRateLow?: number | null;
  unitRateTarget?: number | null;
  unitRateHigh?: number | null;
};

export type SectionTypeLikeForTotals = {
  defaultEstimateUnit?: EstimateUnit | null;
};

/**
 * effectiveUnit = estimateUnit ?? sectionType.defaultEstimateUnit ?? SF
 */
export function getEffectiveEstimateUnit(
  room: RoomLikeForTotals,
  sectionType: SectionTypeLikeForTotals | null | undefined
): EstimateUnit {
  return room.estimateUnit ?? sectionType?.defaultEstimateUnit ?? SF;
}

/**
 * qty = unitQuantity, unless (effectiveUnit === CUSTOM && (unitQuantity is null or <= 0)) then qty = 1
 */
export function getEffectiveQty(
  unitQuantity: number | null | undefined,
  effectiveUnit: EstimateUnit
): number {
  if (effectiveUnit === CUSTOM && (unitQuantity == null || unitQuantity <= 0)) {
    return 1;
  }
  return unitQuantity != null && !Number.isNaN(unitQuantity) ? unitQuantity : 0;
}

function roundToZero(value: number): number {
  return Math.round(value);
}

export type SectionTotals = {
  qty: number;
  totalLow: number | null;
  totalTarget: number | null;
  totalHigh: number | null;
};

/**
 * Compute section totals from room-like data and optional section type.
 * Returns { qty, totalLow, totalTarget, totalHigh } with totals rounded to integers.
 */
export function computeSectionTotals(
  room: RoomLikeForTotals,
  sectionType?: SectionTypeLikeForTotals | null
): SectionTotals {
  const effectiveUnit = getEffectiveEstimateUnit(room, sectionType);
  const qty = getEffectiveQty(room.unitQuantity, effectiveUnit);

  const totalLow =
    room.unitRateLow != null && !Number.isNaN(room.unitRateLow)
      ? roundToZero(room.unitRateLow * qty)
      : null;
  const totalTarget =
    room.unitRateTarget != null && !Number.isNaN(room.unitRateTarget)
      ? roundToZero(room.unitRateTarget * qty)
      : null;
  const totalHigh =
    room.unitRateHigh != null && !Number.isNaN(room.unitRateHigh)
      ? roundToZero(room.unitRateHigh * qty)
      : null;

  return { qty, totalLow, totalTarget, totalHigh };
}
