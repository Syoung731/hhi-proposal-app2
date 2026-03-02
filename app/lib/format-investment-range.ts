/**
 * Format investment range for display.
 * - If low, target, and high all exist: "$low / $target / $high"
 * - If only low and high: "$low – $high"
 * - If only target: "Target $target"
 * - Otherwise: "—"
 */
export function formatInvestmentRange(
  low: number | null,
  target: number | null | undefined,
  high: number | null
): string {
  const fmt = (n: number) => `$${n.toLocaleString()}`;
  if (low != null && target != null && high != null)
    return `${fmt(low)} / ${fmt(target)} / ${fmt(high)}`;
  if (low != null && high != null) return `${fmt(low)} – ${fmt(high)}`;
  if (target != null) return `Target ${fmt(target)}`;
  return "—";
}
