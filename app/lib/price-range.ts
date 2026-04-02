/**
 * Calculate price range for an estimate line item based on source type.
 *
 * Source-type multipliers widen the range for less certain items:
 *   CATALOG (high confidence): 1.0x  → uses settings range as-is
 *   AI_PRICED (medium):        1.25x → widens range by 25%
 *   ALLOWANCE (low):           1.5x  → widens range by 50%
 *   MANUAL (user-set):         1.0x  → same confidence as catalog
 */

const SOURCE_MULTIPLIERS: Record<string, number> = {
  CATALOG: 1.0,
  AI_PRICED: 1.25,
  ALLOWANCE: 1.5,
  MANUAL: 1.0,
};

export function calcItemPriceRange(
  totalPrice: number,
  source: string,
  lowPct: number,
  highPct: number,
): { totalPriceLow: number; totalPriceHigh: number } {
  const mult = SOURCE_MULTIPLIERS[source] ?? 1.25;
  const effectiveLow = lowPct * mult;
  const effectiveHigh = highPct * mult;

  return {
    totalPriceLow: Math.round(totalPrice * (1 + effectiveLow / 100) * 100) / 100,
    totalPriceHigh: Math.round(totalPrice * (1 + effectiveHigh / 100) * 100) / 100,
  };
}
