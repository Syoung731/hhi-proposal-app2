/**
 * Read-only display labels for EstimateUnit (when not CUSTOM).
 * Used in Section editor for "Estimate Unit" panel.
 */
import type { EstimateUnit } from "@/app/generated/prisma";

export const ESTIMATE_UNIT_LABELS: Record<Exclude<EstimateUnit, "CUSTOM">, string> = {
  SF: "sq ft",
  LF: "linear ft",
  EA: "each",
  SQ: "roof squares",
  HR: "hours",
  DAY: "days",
  ROOM: "room",
  UNIT: "unit",
  GAL: "gallons",
};

export function getEstimateUnitLabel(
  unit: EstimateUnit | null | undefined,
  customLabel: string | null | undefined
): string {
  if (unit === "CUSTOM" && (customLabel ?? "").trim()) return (customLabel ?? "").trim();
  if (unit && unit in ESTIMATE_UNIT_LABELS) return ESTIMATE_UNIT_LABELS[unit as Exclude<EstimateUnit, "CUSTOM">];
  return "—";
}
