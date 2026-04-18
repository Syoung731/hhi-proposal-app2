/**
 * Design/Feasibility Retainer math.
 *
 * The retainer is a fixed dollar amount, typically a % of the subtotal HIGH
 * (sum of per-room highs, excluding the retainer itself), rounded to a
 * round-dollar increment controlled by the admin. An override lets the admin
 * set an exact amount that wins over the computed value.
 */

export type RetainerSettings = {
  enabled: boolean;
  percent: number;      // e.g. 0.08
  roundTo: number;      // e.g. 1000 — round to nearest $1,000
  override: number | null;
};

function roundToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return Math.round(value);
  return Math.round(value / increment) * increment;
}

/**
 * Compute the retainer dollar amount from a subtotal high and settings.
 * Returns 0 when retainer is disabled.
 * Override (when set and >= 0) always wins over the computed amount.
 */
export function computeRetainer(
  subtotalHigh: number | null,
  settings: RetainerSettings
): number {
  if (!settings.enabled) return 0;
  if (settings.override != null && settings.override >= 0) {
    return Math.round(settings.override);
  }
  const base = subtotalHigh ?? 0;
  const raw = base * (settings.percent ?? 0);
  return roundToIncrement(raw, settings.roundTo);
}

/** Format as "$11,000" style dollars. */
export function formatRetainerAmount(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}`;
}
