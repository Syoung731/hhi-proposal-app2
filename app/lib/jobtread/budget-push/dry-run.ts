/**
 * Shared dry-run orchestration for the template-overlay JobTread budget push.
 *
 * Builds the budget tree, resolves a JobTread costCode/costType for every line
 * against the LIVE catalog (read-only), assembles the `createJob` Pave payload
 * that the real push WOULD send, and computes stats + warnings — issuing NO
 * JobTread write. Consumed by BOTH the JSON API route
 * (`app/api/admin/jobtread/budget-push/dry-run/route.ts`) and the human-readable
 * preview page (`app/admin/jobtread-budget-preview/page.tsx`) so there is one
 * source of truth.
 */
import "server-only";

import { buildJobTreadBudgetTree } from "./merge";
import { createCostCodeResolver } from "./cost-code-resolver";
import { buildCreateJobPayload } from "./pave-payload";
import type {
  CostCodeResolver,
  CostTypeHint,
  JobTreadBudgetTree,
  JTCostItem,
  PaveQuery,
} from "./types";

// JobTread caps a single Pave write at ~1500 line items; warn before then.
export const LINE_ITEM_WARN_THRESHOLD = 1500;

// Placeholder — a dry run never touches a real JobTread location.
const DRY_RUN_LOCATION_ID = "DRY_RUN_LOCATION_ID";

// Job-stage value for the Design-Contract phase (matches the live push default).
const DRY_RUN_JOB_STAGE = "Design Contract";

export interface DryRunStats {
  roomCount: number;
  lineItemCount: number;
  templateScaffoldCount: number;
  estimateCount: number;
  extraCount: number;
  unmatchedCostCodeCount: number;
}

export interface BudgetPushDryRun {
  projectId: string;
  projectTitle: string;
  tree: JobTreadBudgetTree;
  payload: PaveQuery;
  stats: DryRunStats;
  warnings: string[];
}

/**
 * Derive the Material / Install (labor) / Sub hint from a line's name suffix,
 * matching the convention documented on `CostCodeResolver.resolve`: names follow
 * "[PREFIX] Item - Material" / " - Install" (Sub for subcontract).
 */
export function costTypeHintFromName(name: string): CostTypeHint {
  const lower = name.toLowerCase();
  if (lower.endsWith("- material") || lower.endsWith("- materials")) return "Material";
  if (lower.endsWith("- install") || lower.endsWith("- labor")) return "Install";
  if (lower.endsWith("- sub") || lower.endsWith("- subcontract")) return "Sub";
  if (lower.includes("material")) return "Material";
  if (lower.includes("labor") || lower.includes("install")) return "Install";
  if (lower.includes("sub")) return "Sub";
  return null;
}

/** Resolve a costCode/costType for every line in place; returns the unmatched count. */
function resolveTreeCostCodes(tree: JobTreadBudgetTree, resolver: CostCodeResolver): number {
  let unmatched = 0;
  for (const room of tree.rooms) {
    for (const trade of room.trades) {
      for (const item of trade.items) {
        const resolution = resolver.resolve(
          trade.tradeName,
          costTypeHintFromName(item.name),
          item.costCodeName,
          item.costTypeName,
        );
        item.costCodeId = resolution.costCodeId;
        item.costCodeName = resolution.costCodeName;
        item.costTypeId = resolution.costTypeId;
        item.costTypeName = resolution.costTypeName;
        if (resolution.matchKind === "unmatched" || resolution.costCodeId == null) {
          unmatched += 1;
        }
      }
    }
  }
  return unmatched;
}

function computeStats(tree: JobTreadBudgetTree, unmatchedCostCodeCount: number): DryRunStats {
  let lineItemCount = 0;
  let templateScaffoldCount = 0;
  let estimateCount = 0;
  let extraCount = 0;
  for (const room of tree.rooms) {
    for (const trade of room.trades) {
      for (const item of trade.items) {
        lineItemCount += 1;
        if (item.lineSource === "TEMPLATE_SCAFFOLD") templateScaffoldCount += 1;
        else if (item.lineSource === "ESTIMATE") estimateCount += 1;
        else extraCount += 1;
      }
    }
  }
  return {
    roomCount: tree.rooms.length,
    lineItemCount,
    templateScaffoldCount,
    estimateCount,
    extraCount,
    unmatchedCostCodeCount,
  };
}

function flattenItems(tree: JobTreadBudgetTree): Array<{ room: string; trade: string; item: JTCostItem }> {
  const out: Array<{ room: string; trade: string; item: JTCostItem }> = [];
  for (const room of tree.rooms)
    for (const trade of room.trades)
      for (const item of trade.items) out.push({ room: room.roomName, trade: trade.tradeName, item });
  return out;
}

function buildWarnings(tree: JobTreadBudgetTree, stats: DryRunStats): string[] {
  const warnings: string[] = [];
  if (tree.roomsWithoutTemplate.length > 0) {
    warnings.push(
      `${tree.roomsWithoutTemplate.length} room(s) have an estimate but no template scaffold (estimate-only fallback): ${tree.roomsWithoutTemplate.join(", ")}`,
    );
  }
  if (tree.roomsWithoutEstimate.length > 0) {
    warnings.push(
      `${tree.roomsWithoutEstimate.length} room(s) skipped — no AI estimate: ${tree.roomsWithoutEstimate.join(", ")}`,
    );
  }
  if (stats.unmatchedCostCodeCount > 0) {
    const unmatched = flattenItems(tree).filter((e) => e.item.costCodeId == null);
    const sample = unmatched.slice(0, 10).map((e) => `${e.room} > ${e.trade} > ${e.item.name}`);
    const suffix = unmatched.length > sample.length ? `, …(+${unmatched.length - sample.length} more)` : "";
    warnings.push(
      `${stats.unmatchedCostCodeCount} line(s) could not resolve a JobTread cost code — manual selection required before push: ${sample.join("; ")}${suffix}`,
    );
  }
  if (stats.lineItemCount > LINE_ITEM_WARN_THRESHOLD) {
    warnings.push(
      `Budget has ${stats.lineItemCount} line items (> ${LINE_ITEM_WARN_THRESHOLD}) — exceeds the safe single-call write size; the live push will need to batch.`,
    );
  }
  if (stats.roomCount === 0) {
    warnings.push("No rooms with pushable content — nothing would be written.");
  }
  return warnings;
}

/**
 * Run the full dry-run pipeline for a project. PURE read-only — no JobTread
 * writes. `projectTitle` is supplied by the caller (it already loaded the
 * Project for the existence check) to avoid a duplicate query.
 */
export async function runBudgetPushDryRun(
  projectId: string,
  projectTitle: string,
): Promise<BudgetPushDryRun> {
  const tree = await buildJobTreadBudgetTree(projectId);
  const resolver = await createCostCodeResolver();
  const unmatchedCostCodeCount = resolveTreeCostCodes(tree, resolver);
  const payload = buildCreateJobPayload(tree, {
    locationId: DRY_RUN_LOCATION_ID,
    name: projectTitle,
    jobStageValue: DRY_RUN_JOB_STAGE,
    resolver,
  });
  const stats = computeStats(tree, unmatchedCostCodeCount);
  const warnings = buildWarnings(tree, stats);
  return { projectId, projectTitle, tree, payload, stats, warnings };
}
