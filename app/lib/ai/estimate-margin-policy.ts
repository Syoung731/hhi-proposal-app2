/**
 * HHI estimate margin policy (single source of truth).
 *
 * HHI prices design-build budgets as: materials are client-selected, pushed
 * through at COST (0 margin — they're tracked as allowances), and HHI takes its
 * margin on the LABOR. So the deterministic policy is:
 *
 *   - Material line          → unitPrice = unitCost            (0% margin)
 *   - Install / Subcontract  → unitPrice = unitCost / 0.4      (60% margin == 150% markup)
 *   - Anything else          → unchanged (keep the AI's price)
 *
 * The AI estimates an accurate unitCost; this pass derives unitPrice from it so
 * margins are exact and consistent rather than relying on the model. Applied to
 * the estimate itself (the source of truth) so the Investment tab (AI_ESTIMATE
 * tier), proposal, AND the JobTread push all agree.
 *
 * SCOPE (per product decision):
 *   - Only AI-derived sources (AI_PRICED, ALLOWANCE, CALC) are re-priced.
 *     CATALOG (curated prices) and MANUAL (explicit user overrides) are
 *     preserved untouched.
 *   - Material vs Install/Sub is decided by the shared {@link classifyLine}
 *     classifier so it matches the JobTread allowance default exactly.
 *
 * Margins are constants here (not a CompanySettings field yet) — promote to a
 * setting if HHI wants to tune them without a deploy.
 */

import "server-only";

import { classifyLine } from "@/app/lib/jobtread/budget-push/line-class";
import type { ParsedEstimate } from "@/app/lib/ai-estimate-parser";

/** Material margin: 0% — materials pass through at cost. */
export const MATERIAL_MARGIN_PCT = 0;
/** Labor / subcontract margin: 60% (== 150% markup == price = cost / 0.4). */
export const LABOR_MARGIN_PCT = 60;

/**
 * Sources whose AI-derived price we re-derive. CATALOG (curated) and MANUAL
 * (explicit overrides) are preserved — and so is CALC: those are pre-calculated
 * exact values (e.g. permit fees) that must never be marked up.
 */
const POLICY_SOURCES = new Set(["AI_PRICED", "ALLOWANCE"]);

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Sell price from cost at a given margin pct in [0, 100). */
export function priceFromCost(unitCost: number, marginPct: number): number {
  if (marginPct <= 0) return round2(unitCost);
  return round2(unitCost / (1 - marginPct / 100));
}

/**
 * The policy unitPrice for a single line. Returns `fallbackUnitPrice` unchanged
 * for non-policy sources (catalog/manual) and for lines that don't classify as
 * material or install/sub (ambiguous — keep the AI's price). Use this at any
 * per-line price-computation site (e.g. AI trade-update add/update ops).
 */
export function resolvePolicyUnitPrice(
  name: string,
  source: string,
  unitCost: number,
  fallbackUnitPrice: number,
): number {
  if (!POLICY_SOURCES.has(source)) return fallbackUnitPrice;
  const hint = classifyLine(name);
  if (hint === "Material") return priceFromCost(unitCost, MATERIAL_MARGIN_PCT);
  if (hint === "Install" || hint === "Sub")
    return priceFromCost(unitCost, LABOR_MARGIN_PCT);
  return fallbackUnitPrice;
}

/**
 * Apply the margin policy in place to a parsed estimate: re-derive unitPrice for
 * eligible lines, recompute those lines' totalCost/totalPrice, and re-sum the
 * estimate totals if anything changed. Catalog/manual/ambiguous lines are left
 * exactly as the parser produced them. Returns the number of lines adjusted.
 */
export function applyMarginPolicy(estimate: ParsedEstimate): number {
  let adjusted = 0;
  for (const item of estimate.items) {
    const newPrice = resolvePolicyUnitPrice(
      item.name,
      item.source,
      item.unitCost,
      item.unitPrice,
    );
    if (newPrice === item.unitPrice) continue;
    item.unitPrice = newPrice;
    item.totalCost = round2(item.unitCost * item.quantity);
    item.totalPrice = round2(item.unitPrice * item.quantity);
    adjusted += 1;
  }
  if (adjusted > 0) {
    estimate.totalCost = round2(
      estimate.items.reduce((s, i) => s + i.totalCost, 0),
    );
    estimate.totalPrice = round2(
      estimate.items.reduce((s, i) => s + i.totalPrice, 0),
    );
  }
  return adjusted;
}
