/**
 * Server-side utility: compute a room's price range (low/high) from its SectionType.
 *
 * Mirrors the display logic in rooms-tab.tsx (getUnitLowHigh + getRangeTotal),
 * but operates on Prisma query shapes rather than the client Room type.
 * Used by recomputeInvestmentRollups to derive live values from SectionType
 * rates instead of reading stale Room.totalLow / Room.totalHigh.
 */

const DEFAULT_LOW_PCT = -10;
const DEFAULT_HIGH_PCT = 10;

/** Minimal SectionType fields needed for pricing. */
export interface SectionTypeForRange {
  pricingBasis: string | null | undefined;
  priceTarget: number | null | undefined;
  priceLow: number | null | undefined;
  priceHigh: number | null | undefined;
}

/** Minimal Room fields needed for pricing. */
export interface RoomForRange {
  areaSqFt: number | null | undefined;
  quantity: number | null | undefined;
  unitQuantity: number | null | undefined;
  subAreas?: Array<{
    areaSqFt: number | null | undefined;
    includeInArea: boolean | null | undefined;
  }>;
}

/** Combined sq ft: base room.areaSqFt + included sub-areas (mirrors getCombinedSqFt). */
export function getCombinedSqFtServer(room: RoomForRange): number | null {
  const base =
    room.areaSqFt != null && !Number.isNaN(room.areaSqFt) && room.areaSqFt > 0
      ? room.areaSqFt
      : null;

  const extra =
    room.subAreas
      ?.filter((sa) => sa.includeInArea !== false)
      .reduce((sum, sa) => sum + (sa.areaSqFt ?? 0), 0) ?? 0;

  const total = (base ?? 0) + extra;
  return total > 0 ? total : null;
}

/**
 * Compute unit low/high ($ per unit) for a SectionType.
 * Mirrors getUnitLowHigh from rooms-tab.tsx exactly.
 */
export function getUnitLowHighServer(
  st: SectionTypeForRange,
  lowPct: number = DEFAULT_LOW_PCT,
  highPct: number = DEFAULT_HIGH_PCT
): { unitLow: number; unitHigh: number } | null {
  const basis = st.pricingBasis ?? "NONE";
  if (basis === "NONE") return null;

  const target = st.priceTarget ?? null;
  const overrideLow = st.priceLow ?? null;
  const overrideHigh = st.priceHigh ?? null;

  const unitLow: number | null =
    overrideLow ?? (target != null ? Math.floor(target * (1 + lowPct / 100)) : null);
  const unitHigh: number | null =
    overrideHigh ?? (target != null ? Math.ceil(target * (1 + highPct / 100)) : null);

  if (unitLow == null && unitHigh == null) return null;
  const low = unitLow ?? unitHigh!;
  const high = unitHigh ?? unitLow!;
  return { unitLow: low, unitHigh: high };
}

/**
 * Compute the total price range for a room from its SectionType.
 * Returns null when the room has no SectionType or the SectionType has no pricing.
 * Mirrors getUnitLowHigh + getRangeTotal from rooms-tab.tsx.
 */
export function computeRoomPriceRange(
  room: RoomForRange,
  st: SectionTypeForRange,
  lowPct: number = DEFAULT_LOW_PCT,
  highPct: number = DEFAULT_HIGH_PCT
): { rangeLow: number; rangeHigh: number } | null {
  const basis = st.pricingBasis ?? "NONE";
  if (basis === "NONE") return null;

  const unitRange = getUnitLowHighServer(st, lowPct, highPct);
  if (!unitRange) return null;

  const { unitLow, unitHigh } = unitRange;

  if (basis === "PER_SF") {
    const sqFt = getCombinedSqFtServer(room);
    if (sqFt == null || sqFt <= 0) return null;
    return {
      rangeLow: Math.floor(unitLow * sqFt),
      rangeHigh: Math.ceil(unitHigh * sqFt),
    };
  }

  if (basis === "PER_JOB") {
    return {
      rangeLow: Math.floor(unitLow),
      rangeHigh: Math.ceil(unitHigh),
    };
  }

  if (basis === "PER_EACH") {
    const qty = room.quantity ?? room.unitQuantity ?? 1;
    return {
      rangeLow: Math.floor(unitLow * qty),
      rangeHigh: Math.ceil(unitHigh * qty),
    };
  }

  return null;
}
