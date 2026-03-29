/**
 * Server-only JobTread canonical budget sync.
 * SyncedBudgetRow is the single source of truth; official totals come from summed rows only.
 *
 * Fetch layer: we use the practical DataX-style formatted budget export (text) and parse it,
 * rather than guessing unsupported raw Pave fields. Official totals still come only from
 * parsed row-level extCost/extSell (or fallback qty*cost, qty*price) summed in canonical rows.
 */
import { createHash } from "crypto";
import { Prisma } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";
import { logDevError, logDevSyncRun, updateDevSyncRun } from "@/src/lib/dev-context";
import type {
  NormalizedJobBudget,
  NormalizedBudgetItem,
  CanonicalBudgetRowInput,
} from "./budget-types";
import { JobTreadApiError } from "./client";
import { parseBudgetExportText } from "./budget-text-parser";
import { looksLikeCostCodeName } from "./cost-code-heuristics";
import { DEBUG_JOBTREAD_SYNC } from "./debug";

/** Set via env SYNC_ONE_ROW_TEST=1 to insert only the first row and log it (diagnostic). */
const ONE_ROW_TEST =
  process.env.SYNC_ONE_ROW_TEST === "1" || process.env.SYNC_ONE_ROW_TEST === "true";

/** Job id for raw-hierarchy duplication diagnostic (125 South Shore #1302). */
const RAW_HIERARCHY_DIAG_JOB_ID = "22PJXd2cjdhN";

// ---------------------------------------------------------------------------
// Pure transformation helpers
// ---------------------------------------------------------------------------

/**
 * Normalize Prisma.Decimal-like values (or other numeric wrappers) to plain numbers.
 * SyncedBudgetRow.createMany() must receive primitives only; Prisma coerces number to Decimal in the DB.
 */
function normalizeNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object") {
    const anyVal = value as { toNumber?: () => number };
    if (typeof anyVal.toNumber === "function") {
      const n = anyVal.toNumber();
      return Number.isFinite(n) ? n : null;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Recursively sanitize a value for Prisma Json storage:
 * - Replace Decimal-like (toNumber) with number
 * - Strip undefined (omit key in objects, null in arrays)
 * - Only primitives, plain objects, arrays allowed
 */
function jsonSafePayload(value: unknown): unknown {
  if (value === undefined) return null;
  if (value == null) return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof (obj as { toNumber?: () => number }).toNumber === "function") {
      const n = (obj as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : null;
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((v) => (v === undefined ? null : jsonSafePayload(v)));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      const safe = jsonSafePayload(v);
      if (safe === undefined) continue;
      out[k] = safe;
    }
    return out;
  }
  return null;
}

/** Return true if value (or any nested value) is undefined. */
function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasUndefined);
  return Object.values(value as Record<string, unknown>).some(hasUndefined);
}

/**
 * Strict deep sanitizer for Prisma Json: output is valid InputJsonValue only.
 * - Removes undefined keys
 * - Converts Decimal-like (toNumber) to number
 * - Converts Date to ISO string
 * - Replaces NaN/Infinity with null
 * - Plain objects only (no class instances); non-plain objects replaced with null
 */
function toPrismaJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof (obj as { toNumber?: () => number }).toNumber === "function") {
      const n = (obj as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : null;
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((v) => toPrismaJson(v));
    }
    if (Object.prototype.toString.call(value) !== "[object Object]") {
      return null;
    }
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      const safe = toPrismaJson(v);
      if (safe === undefined) continue;
      out[k] = safe;
    }
    return out;
  }
  return null;
}

/** Returns a short reason if the value is invalid for Prisma (undefined, NaN, Infinity, function, class instance). */
function invalidValueReason(value: unknown): string | null {
  if (value === undefined) return "undefined";
  if (typeof value === "number" && (Number.isNaN(value) || !Number.isFinite(value))) return "NaN_or_Infinity";
  if (typeof value === "function") return "function";
  if (typeof value === "symbol") return "symbol";
  if (value != null && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Object]" && !Array.isArray(value) && !(value instanceof Date)) {
    const hasToNumber = typeof (value as { toNumber?: unknown }).toNumber === "function";
    if (!hasToNumber) return "non_plain_object";
  }
  return null;
}

/** Scan one row; return list of field names that have invalid values. */
function scanRowInvalidFields(row: Record<string, unknown>): string[] {
  const invalid: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    const reason = invalidValueReason(v);
    if (reason) invalid.push(`${k}(${reason})`);
  }
  return invalid;
}

/** Convert nullable number to Prisma Decimal-compatible value (for DB). */
export function toDecimal(value: number | null | undefined): Prisma.Decimal {
  if (value == null || !Number.isFinite(value)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

/** Nullable decimal for optional fields (quantity, unitCost, unitPrice). */
export function toDecimalOrNull(
  value: number | null | undefined
): Prisma.Decimal | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  return new Prisma.Decimal(value);
}

/** Compute ext cost: use source extCost when present, else quantity * unitCost. */
export function rowExtCost(item: NormalizedBudgetItem): number {
  if (item.extCost != null && Number.isFinite(item.extCost)) return item.extCost;
  const q = item.quantity ?? 0;
  const uc = item.unitCost ?? 0;
  return q * uc;
}

/** Compute ext sell: use source extSell when present, else quantity * unitPrice. */
export function rowExtSell(item: NormalizedBudgetItem): number {
  if (item.extSell != null && Number.isFinite(item.extSell)) return item.extSell;
  const q = item.quantity ?? 0;
  const up = item.unitPrice ?? 0;
  return q * up;
}

/** Flatten normalized budget groups + items into canonical row inputs. Preserves hierarchy: cost group + parent cost group. */
export function flattenBudgetToCanonicalRows(
  budget: NormalizedJobBudget
): CanonicalBudgetRowInput[] {
  const { jobId, jobName, groups, items } = budget;
  const groupById = new Map<string, { name: string; parentId: string | null }>();
  for (const g of groups) {
    if (g.id && g.name) {
      groupById.set(g.id, { name: g.name, parentId: g.parentId ?? null });
    }
  }

  const rows: CanonicalBudgetRowInput[] = [];
  for (const item of items) {
    const groupId = item.groupId ?? null;
    const group = groupId ? groupById.get(groupId) : null;
    let groupName = item.groupName ?? group?.name ?? null;
    const parentId = group?.parentId ?? null;
    const parent = parentId ? groupById.get(parentId) : null;
    let parentCostGroupName = parent?.name ?? null;

    // Never promote item-level cost code names into hierarchy fields.
    // costCode/costCodeName stay item-level only; they must not create room/group nodes.
    if (looksLikeCostCodeName(groupName)) groupName = null;
    if (looksLikeCostCodeName(parentCostGroupName)) parentCostGroupName = null;

    rows.push({
      jobId,
      jobName,
      externalBudgetItemId: item.id,
      groupName: groupName ?? null,
      costGroupId: groupId,
      parentCostGroupId: parentId,
      parentCostGroupName: parentCostGroupName,
      itemName: item.name,
      costCode: item.costCode ?? null,
      costCodeName: item.costCodeName ?? null,
      costType: item.costType ?? null,
      unit: item.unit ?? null,
      quantity: item.quantity ?? null,
      unitCost: item.unitCost ?? null,
      unitPrice: item.unitPrice ?? null,
      extCost: rowExtCost(item),
      extSell: rowExtSell(item),
      rawPayloadJson: (item as unknown as Record<string, unknown>) ?? {},
    });
  }
  return rows;
}

/** Sum extSell and extCost from canonical rows (official totals). */
export function computeOfficialTotalsFromRows(rows: CanonicalBudgetRowInput[]): {
  sellTotal: number;
  costTotal: number;
} {
  let sellTotal = 0;
  let costTotal = 0;
  for (const r of rows) {
    sellTotal += r.extSell;
    costTotal += r.extCost;
  }
  return { sellTotal, costTotal };
}

/**
 * Compute a stable hash of the normalized budget for change detection.
 * Same budget content => same fingerprint; used to skip syncing unchanged jobs.
 */
export function computeBudgetFingerprint(budget: NormalizedJobBudget): string {
  const rows = flattenBudgetToCanonicalRows(budget);
  const sorted = [...rows].sort((a, b) =>
    a.externalBudgetItemId.localeCompare(b.externalBudgetItemId)
  );
  const payload = sorted.map((r) => ({
    id: r.externalBudgetItemId,
    g: r.groupName ?? "",
    cg: r.costGroupId ?? "",
    pcg: r.parentCostGroupId ?? "",
    pcn: r.parentCostGroupName ?? "",
    name: r.itemName,
    code: r.costCode ?? "",
    codeName: r.costCodeName ?? "",
    type: r.costType ?? "",
    unit: r.unit ?? "",
    qty: r.quantity ?? null,
    uc: r.unitCost ?? null,
    up: r.unitPrice ?? null,
    extC: r.extCost,
    extS: r.extSell,
  }));
  const json = JSON.stringify(payload);
  return createHash("sha256").update(json, "utf8").digest("hex");
}

/** Tolerance for comparing source summary to row-summed totals (absolute difference). */
const SUMMARY_TOLERANCE = 0.01;

/** If source summary exists, check it matches row totals within tolerance; return status and optional message. */
function checkSourceSummaryVsTotals(
  sourceSell: number | null | undefined,
  sourceCost: number | null | undefined,
  rowSell: number,
  rowCost: number
): { status: "success" | "warning"; message: string | null } {
  if (sourceSell == null && sourceCost == null) return { status: "success", message: null };
  const sellOk =
    sourceSell == null ||
    Math.abs(sourceSell - rowSell) <= SUMMARY_TOLERANCE;
  const costOk =
    sourceCost == null ||
    Math.abs(sourceCost - rowCost) <= SUMMARY_TOLERANCE;
  if (sellOk && costOk) return { status: "success", message: null };
  const parts: string[] = [];
  if (!sellOk) parts.push(`sell source=${sourceSell} vs rows=${rowSell.toFixed(2)}`);
  if (!costOk) parts.push(`cost source=${sourceCost} vs rows=${rowCost.toFixed(2)}`);
  return {
    status: "warning",
    message: `Source summary differs from row sum: ${parts.join("; ")}`,
  };
}

// ---------------------------------------------------------------------------
// Fetch: formatted budget export text -> NormalizedJobBudget (parser path)
// ---------------------------------------------------------------------------

/**
 * Single point where the formatted budget export text is obtained for a job.
 * The practical connector contract is a DataX-style formatted text export; wire the real
 * source here (e.g. JobTread/DataX API endpoint or file) so that it returns the full
 * export string. Do not scatter fetch logic elsewhere.
 */
async function getJobTreadBudgetExportText(_jobId: string): Promise<string> {
  // TODO: Wire the real source that returns the DataX-style budget export text.
  // Example: POST to a budget-export endpoint, or read from a file/queue.
  throw new Error(
    "Budget export fetch not wired: implement getJobTreadBudgetExportText in sync-budget.ts to return the DataX-style formatted budget text for the given jobId."
  );
}

/**
 * Fetch and normalize one job budget from the formatted text export.
 * Uses the parser path: get export text -> parseBudgetExportText -> NormalizedJobBudget.
 * Canonical totals still come only from summed SyncedBudgetRow extCost/extSell.
 */
export async function fetchNormalizedJobBudget(
  jobId: string
): Promise<NormalizedJobBudget | null> {
  const text = await getJobTreadBudgetExportText(jobId);
  const budget = parseBudgetExportText(text);
  if (!budget.jobId && !budget.jobName) return null;
  return budget;
}

// ---------------------------------------------------------------------------
// Raw source diagnostic (125 South Shore — sync input vs flatten vs write)
// ---------------------------------------------------------------------------

type CanonicalBucket =
  | "no-group-row"
  | "leaf-item-row"
  | "suspicious-summary-row"
  | "possible-group-total-row"
  | "possible-room-total-row";

type ClassifiedCanonicalRow = CanonicalBudgetRowInput & {
  bucket: CanonicalBucket;
  signals: string[];
};

/** Heuristic: rawPayloadJson looks like a group/summary node. */
function rawPayloadLooksGroupLike(raw: Record<string, unknown>): boolean {
  const keys = Object.keys(raw).map((k) => k.toLowerCase());
  const groupLikeKeys = ["parentcostgroup", "costgroup", "parentcostgroupid", "childcostgroups", "children"];
  if (groupLikeKeys.some((k) => keys.some((kk) => kk.includes(k) || kk === k))) return true;
  const hasQty = raw.quantity != null && Number(raw.quantity) > 0;
  const hasUnit = raw.unit != null && String(raw.unit).trim() !== "";
  const hasExt =
    (raw.extendedCost != null && Number(raw.extendedCost) > 0) ||
    (raw.extendedPrice != null && Number(raw.extendedPrice) > 0) ||
    (raw.extCost != null && Number(raw.extCost) > 0) ||
    (raw.extSell != null && Number(raw.extSell) > 0);
  if (!hasQty && !hasUnit && hasExt) return true;
  return false;
}

function runRawHierarchyDiagnostic(
  budget: NormalizedJobBudget,
  rows: CanonicalBudgetRowInput[],
): string {
  const jobId = budget.jobId;
  const groupIds = new Set(budget.groups.map((g) => g.id));
  const groupNamesLower = new Set(budget.groups.map((g) => g.name.trim().toLowerCase()));
  const groupNamesExact = new Set(budget.groups.map((g) => g.name.trim()));
  const topLevelGroupNames = new Set(
    budget.groups.filter((g) => g.parentId == null).map((g) => g.name.trim()),
  );
  const childGroupNames = new Set(
    budget.groups.filter((g) => g.parentId != null).map((g) => g.name.trim()),
  );

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const roomTotalsByParentName = new Map<string, { cost: number; sell: number }>();
  const tradeTotalsByGroupName = new Map<string, { cost: number; sell: number }>();
  for (const row of rows) {
    const parentName = (row.parentCostGroupName ?? row.groupName ?? "").trim() || "(none)";
    const groupName = (row.groupName ?? "").trim() || "(none)";
    const c = row.extCost ?? 0;
    const s = row.extSell ?? 0;
    const r = roomTotalsByParentName.get(parentName) ?? { cost: 0, sell: 0 };
    r.cost += c;
    r.sell += s;
    roomTotalsByParentName.set(parentName, r);
    const t = tradeTotalsByGroupName.get(groupName) ?? { cost: 0, sell: 0 };
    t.cost += c;
    t.sell += s;
    tradeTotalsByGroupName.set(groupName, t);
  }

  const classified: ClassifiedCanonicalRow[] = [];
  const TOL = 0.02;

  for (const row of rows) {
    const signals: string[] = [];
    const extId = row.externalBudgetItemId;
    const itemName = row.itemName.trim();
    const itemNameLower = itemName.toLowerCase();
    const costGroupId = row.costGroupId ?? null;
    const parentCostGroupId = row.parentCostGroupId ?? null;
    const groupName = (row.groupName ?? "").trim();
    const parentName = (row.parentCostGroupName ?? "").trim();
    const hasQty = row.quantity != null && Number(row.quantity) > 0;
    const hasUnit = row.unit != null && String(row.unit).trim() !== "";
    const extCost = row.extCost ?? 0;
    const extSell = row.extSell ?? 0;
    const hasExt = extCost > 0 || extSell > 0;
    const raw = (row.rawPayloadJson || {}) as Record<string, unknown>;

    if (groupIds.has(extId)) signals.push("item_id_equals_cost_group_id");
    if (groupNamesLower.has(itemNameLower) || groupNamesExact.has(itemName))
      signals.push("item_name_equals_room_or_group_name");
    if (costGroupId !== null && costGroupId === extId) signals.push("costGroupId_equals_item_id");
    if (!hasQty && !hasUnit && hasExt) signals.push("no_quantity_or_unit_but_has_ext");
    if (groupName && itemName && groupName === itemName) signals.push("groupName_equals_itemName");
    if (rawPayloadLooksGroupLike(raw)) signals.push("raw_payload_looks_group_like");
    if (parentCostGroupId == null && (groupIds.has(extId) || topLevelGroupNames.has(itemName) || groupNamesExact.has(itemName)))
      signals.push("parent_null_but_name_or_id_looks_like_room_or_group");

    const roomTotal = parentName ? roomTotalsByParentName.get(parentName) : null;
    if (roomTotal && extCost > 0 && Math.abs(extCost - roomTotal.cost) / roomTotal.cost < TOL && extSell > 0 && Math.abs(extSell - roomTotal.sell) / roomTotal.sell < TOL)
      signals.push("ext_equals_visible_room_total");
    else if (roomTotal && extCost > 0 && Math.abs(extCost - roomTotal.cost) < 1) signals.push("extCost_near_room_total");
    const tradeTotal = groupName ? tradeTotalsByGroupName.get(groupName) : null;
    if (tradeTotal && extCost > 0 && Math.abs(extCost - tradeTotal.cost) / Math.max(tradeTotal.cost, 1) < TOL)
      signals.push("ext_near_trade_total");

    const hasSignals = signals.length > 0;
    const isNoGroup = costGroupId == null && parentCostGroupId == null;
    const possibleRoomTotal =
      parentCostGroupId == null &&
      (groupIds.has(extId) ||
        topLevelGroupNames.has(itemName) ||
        groupNamesLower.has(itemNameLower) ||
        groupNamesExact.has(itemName) ||
        (signals.includes("ext_equals_visible_room_total") || signals.includes("extCost_near_room_total")));
    const possibleGroupTotal =
      parentCostGroupId != null &&
      (groupIds.has(extId) ||
        childGroupNames.has(itemName) ||
        groupNamesLower.has(itemNameLower) ||
        groupNamesExact.has(itemName) ||
        signals.includes("ext_near_trade_total"));

    let bucket: CanonicalBucket;
    if (isNoGroup) bucket = "no-group-row";
    else if (possibleRoomTotal) bucket = "possible-room-total-row";
    else if (possibleGroupTotal) bucket = "possible-group-total-row";
    else if (hasSignals) bucket = "suspicious-summary-row";
    else bucket = "leaf-item-row";

    classified.push({ ...row, bucket, signals });
  }

  const byBucket = new Map<CanonicalBucket, number>();
  for (const b of [
    "no-group-row",
    "leaf-item-row",
    "suspicious-summary-row",
    "possible-group-total-row",
    "possible-room-total-row",
  ] as CanonicalBucket[]) {
    byBucket.set(b, classified.filter((r) => r.bucket === b).length);
  }

  const suspicious = classified.filter((r) => r.signals.length > 0);
  const leafOnly = classified.filter((r) => r.bucket === "leaf-item-row");
  const parentNullRows = classified.filter((r) => (r.parentCostGroupId ?? null) === null);
  const parentNonNullRows = classified.filter((r) => (r.parentCostGroupId ?? null) !== null);

  const sum = (list: ClassifiedCanonicalRow[]) => {
    let c = 0;
    let s = 0;
    for (const r of list) {
      c += r.extCost ?? 0;
      s += r.extSell ?? 0;
    }
    return { cost: c, sell: s };
  };

  const sumAll = sum(classified);
  const sumLeaf = sum(leafOnly);
  const sumSuspiciousSummary = sum(suspicious);
  const sumParentNull = sum(parentNullRows);
  const sumParentNonNull = sum(parentNonNullRows);

  const rawPayloadSummary = (raw: Record<string, unknown>) => {
    const keys = Object.keys(raw).slice(0, 10);
    return keys.length ? `{ ${keys.join(", ")} }` : "{}";
  };

  const top100Suspicious = suspicious.slice(0, 100);

  const suspiciousNormalizedItems: NormalizedBudgetItem[] = [];
  const groupIdsNorm = new Set(budget.groups.map((g) => g.id));
  const groupNamesNorm = new Set(budget.groups.map((g) => g.name.trim().toLowerCase()));
  for (const item of budget.items) {
    const id = item.id?.trim() ?? "";
    const name = (item.name ?? "").trim().toLowerCase();
    const hasQty = item.quantity != null && Number(item.quantity) > 0;
    const hasExt = (item.extCost != null && Number(item.extCost) > 0) || (item.extSell != null && Number(item.extSell) > 0);
    if (groupIdsNorm.has(id) || groupNamesNorm.has(name) || (!hasQty && hasExt)) {
      suspiciousNormalizedItems.push(item);
    }
  }
  const top50NormalizedSuspicious = suspiciousNormalizedItems.slice(0, 50);

  // eslint-disable-next-line no-console
  console.log(`
========== RAW SOURCE DIAGNOSTIC (125 South Shore #1302) ==========
Job: ${budget.jobName} (${jobId})

--- 1) RAW SOURCE ---
  Raw cost group count / raw cost item count and whether source contains summary/rollup/group total rows are logged by the integration when this job is fetched (see "[JobTread sync] RAW SOURCE" and "sample suspicious raw rows").
  Normalized cost group count:  ${budget.groups.length}
  Normalized cost item count:   ${budget.items.length}
  Canonical row count:          ${rows.length}
  Rows written to SyncedBudgetRow: ${rows.length}

--- 2) NORMALIZED OUTPUT ---
  Normalized cost group count:  ${budget.groups.length}
  Normalized cost item count:   ${budget.items.length}
  Top 50 normalized rows that look suspicious (id in group ids, name in group names, or no qty but has ext):
${top50NormalizedSuspicious
  .map(
    (it, i) =>
      `  ${i + 1}. id=${it.id} name="${(it.name ?? "").slice(0, 50)}" groupId=${it.groupId ?? "—"} quantity=${it.quantity ?? "—"} unitCost=${it.unitCost ?? "—"} unitPrice=${it.unitPrice ?? "—"} extCost=${it.extCost ?? "—"} extSell=${it.extSell ?? "—"}`,
  )
  .join("\n") || "  (none)"}

--- 3) CANONICAL FLATTENING (flattenBudgetToCanonicalRows) ---
  no-group-row:              ${byBucket.get("no-group-row") ?? 0}
  leaf-item-row:             ${byBucket.get("leaf-item-row") ?? 0}
  suspicious-summary-row:   ${byBucket.get("suspicious-summary-row") ?? 0}
  possible-group-total-row:  ${byBucket.get("possible-group-total-row") ?? 0}
  possible-room-total-row:   ${byBucket.get("possible-room-total-row") ?? 0}

--- 4) FINANCIAL SPLIT ---
  All canonical rows:           sell=${fmt(sumAll.sell)}  cost=${fmt(sumAll.cost)}
  leaf-item-row only:           sell=${fmt(sumLeaf.sell)}  cost=${fmt(sumLeaf.cost)}
  suspicious-summary (signals): sell=${fmt(sumSuspiciousSummary.sell)}  cost=${fmt(sumSuspiciousSummary.cost)}
  parentCostGroupId = null:     sell=${fmt(sumParentNull.sell)}  cost=${fmt(sumParentNull.cost)}  (rows: ${parentNullRows.length})
  parentCostGroupId != null:    sell=${fmt(sumParentNonNull.sell)}  cost=${fmt(sumParentNonNull.cost)}  (rows: ${parentNonNullRows.length})

--- 5) TOP 100 SUSPICIOUS ROWS ---
${top100Suspicious
  .map(
    (r, i) =>
      `  ${i + 1}. externalBudgetItemId=${r.externalBudgetItemId} itemName="${(r.itemName || "").slice(0, 50)}" groupName=${r.groupName ?? "—"} costGroupId=${r.costGroupId ?? "—"} parentCostGroupId=${r.parentCostGroupId ?? "—"} parentCostGroupName=${r.parentCostGroupName ?? "—"} extCost=${fmt(r.extCost ?? 0)} extSell=${fmt(r.extSell ?? 0)} explanation=[${r.signals.join("; ")}]`,
  )
  .join("\n")}

========== END RAW SOURCE DIAGNOSTIC ==========
`);

  const doublingInParentNull =
    sumParentNull.cost > 0 && sumParentNull.cost > sumParentNonNull.cost * 1.5;
  let summary = "";
  summary += "1) Are we flattening true leaf items only? ";
  summary += (byBucket.get("leaf-item-row") ?? 0) === rows.length && suspicious.length === 0
    ? "Yes; all rows are classified as leaf-item-row and none have summary/rollup signals. "
    : "No; " + (byBucket.get("leaf-item-row") ?? 0) + " leaf rows and " + suspicious.length + " rows have summary/rollup signals. ";
  summary += "2) Are we also flattening rollup/group-summary nodes as rows? ";
  summary += suspicious.length > 0
    ? "Yes; " + suspicious.length + " canonical rows look like summary/room total/group total (item name equals group name, item id equals group id, or raw payload group-like). "
    : "No. ";
  summary += "3) Is the doubling mostly from parentCostGroupId=null rows? ";
  summary += doublingInParentNull
    ? "Yes; parentCostGroupId=null rows sum to sell=" + fmt(sumParentNull.sell) + " cost=" + fmt(sumParentNull.cost) + " vs non-null cost=" + fmt(sumParentNonNull.cost) + ". "
    : "Not clearly; parent-null and parent-non-null both contribute. ";
  summary += "4) Which exact code path produces the wrong rows? ";
  summary += "syncNormalizedJobBudget(budget) is called with budget from the integration (jobtread-pricing: job.costGroups and job.costItems mapped to budget.groups and budget.items). flattenBudgetToCanonicalRows(budget) loops over budget.items and creates one canonical row per item; those rows are written to SyncedBudgetRow. So any summary/rollup rows in the wrong place come from budget.items (i.e. either the JobTread API is returning group/summary nodes inside costItems, or the normalizer is including them). Check raw source logs for this job to see if suspicious rows appear in the API response.";

  // eslint-disable-next-line no-console
  console.log("[Raw source diagnostic] Summary:", summary);
  return summary;
}

// ---------------------------------------------------------------------------
// Sync flow
// ---------------------------------------------------------------------------

export type SyncJobBudgetResult = {
  status: "success" | "warning" | "error";
  message: string | null;
  rowCount: number;
  sellTotal: number;
  costTotal: number;
};

/**
 * Build the createMany payload for SyncedBudgetRow (plain numbers, sanitized JSON).
 * Done outside the transaction to keep the transaction short.
 */
function buildSyncedBudgetRowPayload(
  rows: CanonicalBudgetRowInput[],
): Record<string, unknown>[] {
  return rows.map((r) => {
    const quantity = normalizeNumber(r.quantity);
    const unitCost = normalizeNumber(r.unitCost);
    const unitPrice = normalizeNumber(r.unitPrice);
    const extCost = normalizeNumber(r.extCost) ?? 0;
    const extSell = normalizeNumber(r.extSell) ?? 0;
    const rawPayloadJsonValue = (toPrismaJson(r.rawPayloadJson) ?? {}) as Prisma.InputJsonValue;
    return {
      jobId: String(r.jobId),
      jobName: String(r.jobName),
      externalBudgetItemId: String(r.externalBudgetItemId),
      groupName: r.groupName ?? null,
      costGroupId: r.costGroupId ?? null,
      parentCostGroupId: r.parentCostGroupId ?? null,
      parentCostGroupName: r.parentCostGroupName ?? null,
      itemName: String(r.itemName),
      costCode: r.costCode ?? null,
      costCodeName: r.costCodeName ?? null,
      costType: r.costType ?? null,
      unit: r.unit ?? null,
      quantity,
      unitCost,
      unitPrice,
      extCost,
      extSell,
      rawPayloadJson: rawPayloadJsonValue,
    };
  });
}

/**
 * Shared core: sync an already-normalized budget into canonical SyncedBudgetJob + SyncedBudgetRow.
 * All expensive work (flatten, normalize, sanitize) runs before the transaction; the transaction
 * only performs the minimal DB writes to avoid P2028 timeout.
 */
export async function syncNormalizedJobBudget(
  budget: NormalizedJobBudget
): Promise<SyncJobBudgetResult> {
  const t0 = Date.now();
  const now = new Date();
  const jobId = budget.jobId;
  let status: "success" | "warning" | "error" = "success";
  let message: string | null = null;

  const syncRunId = await logDevSyncRun({
    jobId,
    status: "running",
    summary: "jobtread sync started (syncNormalizedJobBudget)",
    route: "jobtread/syncNormalizedJobBudget",
  });

  try {

  // --- All expensive work before the transaction ---
  const rows = flattenBudgetToCanonicalRows(budget);
  if (
    DEBUG_JOBTREAD_SYNC &&
    jobId === RAW_HIERARCHY_DIAG_JOB_ID &&
    process.env.NODE_ENV !== "production"
  ) {
    runRawHierarchyDiagnostic(budget, rows);
  }
  const totals = computeOfficialTotalsFromRows(rows);
  const rowCount = rows.length;
  const sellTotal = totals.sellTotal;
  const costTotal = totals.costTotal;

  const summaryCheck = checkSourceSummaryVsTotals(
    budget.sourceSummarySell,
    budget.sourceSummaryCost,
    sellTotal,
    costTotal
  );
  if (summaryCheck.status === "warning") {
    status = "warning";
    message = summaryCheck.message;
  }

  const rowData = buildSyncedBudgetRowPayload(rows);
  const dataToInsert = ONE_ROW_TEST ? rowData.slice(0, 1) : rowData;
  const t1 = Date.now();

  if (DEBUG_JOBTREAD_SYNC && ONE_ROW_TEST && dataToInsert[0]) {
    // eslint-disable-next-line no-console
    console.log("[JobTread sync] ONE_ROW_TEST: inserting single row:", JSON.stringify(dataToInsert[0], null, 2));
  }

  if (DEBUG_JOBTREAD_SYNC && process.env.NODE_ENV !== "production" && rowData[0]) {
    const first = rowData[0] as Record<string, unknown>;
    const keys = Object.keys(first);
    const schemaFields = [
      "jobId", "jobName", "externalBudgetItemId", "groupName", "costGroupId",
      "parentCostGroupId", "parentCostGroupName", "itemName", "costCode",
      "costCodeName", "costType", "unit", "quantity", "unitCost", "unitPrice",
      "extCost", "extSell", "rawPayloadJson",
    ];
    const extra = keys.filter((k) => !schemaFields.includes(k));
    const missing = schemaFields.filter((k) => !keys.includes(k));
    const types: Record<string, string> = {};
    for (const k of keys) {
      const v = first[k];
      types[k] = v === null ? "null" : typeof v;
      if (k === "rawPayloadJson" && v != null && typeof v === "object") {
        (types as Record<string, unknown>)[`${k}_hasUndefined`] = hasUndefined(v);
      }
    }
    const invalidRows: { index: number; fields: string[] }[] = [];
    for (let i = 0; i < rowData.length; i++) {
      const fields = scanRowInvalidFields(rowData[i] as Record<string, unknown>);
      if (fields.length) invalidRows.push({ index: i, fields });
    }
    // eslint-disable-next-line no-console
    console.log("[JobTread sync] createMany payload check:", {
      payloadKeys: keys,
      extraKeys: extra.length ? extra : undefined,
      missingFromPayload: missing.length ? missing : undefined,
      firstRowTypes: types,
      rowCount: rowData.length,
      invalidRowIndexes: invalidRows.length ? invalidRows : undefined,
    });
  }

  const sourceFingerprint = computeBudgetFingerprint(budget);

  // --- Transaction: only DB writes ---
  const txStart = Date.now();
  await prisma.$transaction(
    async (tx) => {
      await upsertSyncedBudgetJob(tx, {
        jobId,
        jobName: budget.jobName,
        jobNumber: budget.jobNumber ?? null,
        stage: budget.stage ?? null,
        location: budget.location ?? null,
        lastSyncedAt: now,
        lastSyncStatus: status,
        lastSyncMessage: message,
        lastRowCount: rowCount,
        officialSellTotal: sellTotal,
        officialCostTotal: costTotal,
        sourceSummarySell: budget.sourceSummarySell ?? null,
        sourceSummaryCost: budget.sourceSummaryCost ?? null,
        rawBudgetJson: budget as unknown as Prisma.InputJsonValue,
        sourceRowCount: rowCount,
        sourceSellTotal: sellTotal,
        sourceCostTotal: costTotal,
        sourceFingerprint,
      });

      await tx.syncedBudgetRow.deleteMany({ where: { jobId } });

      if (dataToInsert.length > 0) {
        await tx.syncedBudgetRow.createMany({
          data: dataToInsert as Parameters<typeof tx.syncedBudgetRow.createMany>[0]["data"],
        });
      }
    },
    { timeout: 20000 }
  );
  const txMs = Date.now() - txStart;

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[JobTread sync] job timing:", {
      jobId,
      rowCount,
      msBeforeTx: t1 - t0,
      msInTx: txMs,
    });
  }

  logSyncResult(jobId, rowCount, sellTotal, costTotal, status);
  if (syncRunId != null) {
    const completionSummary =
      status === "warning" && message
        ? `completed with warning: ${message}`
        : `completed (rows=${rowCount}, sell=${sellTotal.toFixed(2)}, cost=${costTotal.toFixed(2)})`;
    await updateDevSyncRun(syncRunId, {
      status: "success",
      summary: completionSummary,
      errorMessage: status === "warning" ? message : null,
      route: "jobtread/syncNormalizedJobBudget",
    });
  }
  return { status, message, rowCount, sellTotal, costTotal };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await logDevError({
      source: "server",
      severity: "error",
      message: `JobTread syncNormalizedJobBudget failed: ${errMsg}`,
      route: "jobtread/syncNormalizedJobBudget",
      component: "syncNormalizedJobBudget",
      jobId,
      stack: e instanceof Error ? e.stack ?? null : null,
    });
    if (syncRunId != null) {
      await updateDevSyncRun(syncRunId, {
        status: "failed",
        summary: "jobtread sync failed (syncNormalizedJobBudget)",
        errorMessage: errMsg,
        route: "jobtread/syncNormalizedJobBudget",
      });
    }
    throw e;
  }
}

/**
 * Sync one JobTread job budget by fetching (getJobTreadBudgetExportText) then syncing.
 * Official totals are computed only from SyncedBudgetRow rows.
 */
export async function syncJobBudget(jobId: string): Promise<SyncJobBudgetResult> {
  const now = new Date();
  let status: "success" | "warning" | "error" = "success";
  let message: string | null = null;
  let didCallSyncNormalizedJobBudget = false;
  const env = process.env.NODE_ENV === "production" ? "production" : "local";

  try {
    const budget = await fetchNormalizedJobBudget(jobId);
    if (!budget) {
      status = "error";
      message = "Job not found or budget unavailable.";

      const syncRunId = await logDevSyncRun({
        jobId,
        status: "running",
        summary: "jobtread sync started (budget unavailable)",
        route: "/api/admin/jobtread/sync-budget",
      });
      if (syncRunId != null) {
        await updateDevSyncRun(syncRunId, {
          status: "failed",
          summary: "jobtread sync failed (budget unavailable)",
          errorMessage: message,
          route: "/api/admin/jobtread/sync-budget",
        });
      }
      await logDevError({
        source: "server",
        severity: "error",
        message: message ?? "JobTread sync failed",
        route: "/api/admin/jobtread/sync-budget",
        component: "syncJobBudget",
        jobId,
        env,
      });
      await prisma.$transaction(async (tx) => {
        await upsertSyncedBudgetJob(tx, {
          jobId,
          jobName: "(unknown)",
          jobNumber: null,
          stage: null,
          location: null,
          lastSyncedAt: now,
          lastSyncStatus: status,
          lastSyncMessage: message,
          lastRowCount: 0,
          officialSellTotal: 0,
          officialCostTotal: 0,
          sourceSummarySell: null,
          sourceSummaryCost: null,
          rawBudgetJson: null,
          sourceRowCount: null,
          sourceSellTotal: null,
          sourceCostTotal: null,
          sourceFingerprint: null,
        });
      });
      logSyncResult(jobId, 0, 0, 0, status);
      return { status, message, rowCount: 0, sellTotal: 0, costTotal: 0 };
    }

    didCallSyncNormalizedJobBudget = true;
    return await syncNormalizedJobBudget(budget);
  } catch (e) {
    status = "error";
    if (e instanceof JobTreadApiError) {
      const step = e.step ?? "unknown";
      const statusCode = e.status ?? 0;
      const contentType = e.contentType ?? "";
      const snippet = e.responseSnippet ?? "";
      // eslint-disable-next-line no-console
      console.error(
        "[JobTread sync v2] FAILED\njobId=%s\nstep=%s\nstatus=%s\ncontentType=%s\nresponseSnippet=%s",
        jobId,
        step,
        statusCode,
        contentType,
        snippet ? snippet.slice(0, 500) : "(none)"
      );
      message =
        e.status != null
          ? `JobTread budget fetch failed at step ${step} (HTTP ${e.status})`
          : `JobTread budget fetch failed at step ${step}`;
    } else {
      message = e instanceof Error ? e.message : String(e);
    }

    if (!didCallSyncNormalizedJobBudget) {
      const syncRunId = await logDevSyncRun({
        jobId,
        status: "running",
        summary: "jobtread sync started (exception before normalized sync)",
        route: "/api/admin/jobtread/sync-budget",
      });
      if (syncRunId != null) {
        await updateDevSyncRun(syncRunId, {
          status: "failed",
          summary: "jobtread sync failed (exception)",
          errorMessage: message ?? null,
          route: "/api/admin/jobtread/sync-budget",
        });
      }
      await logDevError({
        source: "server",
        severity: "error",
        message: message ?? "JobTread sync failed",
        route: "/api/admin/jobtread/sync-budget",
        component: "syncJobBudget",
        jobId,
        env,
        stack: e instanceof Error ? e.stack ?? null : null,
      });
    }
    try {
      await prisma.$transaction(async (tx) => {
        await upsertSyncedBudgetJob(tx, {
          jobId,
          jobName: "(unknown)",
          jobNumber: null,
          stage: null,
          location: null,
          lastSyncedAt: now,
          lastSyncStatus: status,
          lastSyncMessage: message,
          lastRowCount: 0,
          officialSellTotal: 0,
          officialCostTotal: 0,
          sourceSummarySell: null,
          sourceSummaryCost: null,
          rawBudgetJson: null,
          sourceRowCount: null,
          sourceSellTotal: null,
          sourceCostTotal: null,
          sourceFingerprint: null,
        });
      });
    } catch {
      // best-effort status update
    }
    logSyncResult(jobId, 0, 0, 0, status);
    return { status, message, rowCount: 0, sellTotal: 0, costTotal: 0 };
  }
}

type UpsertJobPayload = {
  jobId: string;
  jobName: string;
  jobNumber: string | null;
  stage: string | null;
  location: string | null;
  lastSyncedAt: Date;
  lastSyncStatus: string;
  lastSyncMessage: string | null;
  lastRowCount: number;
  officialSellTotal: number;
  officialCostTotal: number;
  sourceSummarySell: number | null;
  sourceSummaryCost: number | null;
  rawBudgetJson: Prisma.InputJsonValue | null;
  sourceRowCount: number | null;
  sourceSellTotal: number | null;
  sourceCostTotal: number | null;
  sourceFingerprint: string | null;
};

async function upsertSyncedBudgetJob(
  tx: Prisma.TransactionClient,
  payload: UpsertJobPayload
) {
  const Decimal = Prisma.Decimal;
  const sourceRowCount = payload.sourceRowCount ?? null;
  const sourceSellTotal =
    payload.sourceSellTotal != null ? new Decimal(payload.sourceSellTotal) : null;
  const sourceCostTotal =
    payload.sourceCostTotal != null ? new Decimal(payload.sourceCostTotal) : null;
  await tx.syncedBudgetJob.upsert({
    where: { jobId: payload.jobId },
    create: {
      jobId: payload.jobId,
      jobName: payload.jobName,
      jobNumber: payload.jobNumber,
      stage: payload.stage,
      location: payload.location,
      lastSyncedAt: payload.lastSyncedAt,
      lastSyncStatus: payload.lastSyncStatus,
      lastSyncMessage: payload.lastSyncMessage,
      lastRowCount: payload.lastRowCount,
      officialSellTotal: new Decimal(payload.officialSellTotal),
      officialCostTotal: new Decimal(payload.officialCostTotal),
      sourceSummarySell:
        payload.sourceSummarySell != null
          ? new Decimal(payload.sourceSummarySell)
          : null,
      sourceSummaryCost:
        payload.sourceSummaryCost != null
          ? new Decimal(payload.sourceSummaryCost)
          : null,
      rawBudgetJson: payload.rawBudgetJson ?? Prisma.JsonNull,
      sourceRowCount,
      sourceSellTotal,
      sourceCostTotal,
      sourceFingerprint: payload.sourceFingerprint ?? null,
    },
    update: {
      jobName: payload.jobName,
      jobNumber: payload.jobNumber,
      stage: payload.stage,
      location: payload.location,
      lastSyncedAt: payload.lastSyncedAt,
      lastSyncStatus: payload.lastSyncStatus,
      lastSyncMessage: payload.lastSyncMessage,
      lastRowCount: payload.lastRowCount,
      officialSellTotal: new Decimal(payload.officialSellTotal),
      officialCostTotal: new Decimal(payload.officialCostTotal),
      sourceSummarySell:
        payload.sourceSummarySell != null
          ? new Decimal(payload.sourceSummarySell)
          : null,
      sourceSummaryCost:
        payload.sourceSummaryCost != null
          ? new Decimal(payload.sourceSummaryCost)
          : null,
      rawBudgetJson: payload.rawBudgetJson ?? Prisma.JsonNull,
      sourceRowCount,
      sourceSellTotal,
      sourceCostTotal,
      sourceFingerprint: payload.sourceFingerprint ?? null,
    },
  });
}

function logSyncResult(
  jobId: string,
  rowCount: number,
  sellTotal: number,
  costTotal: number,
  status: string
) {
  // eslint-disable-next-line no-console
  console.log(
    "[JobTread sync v2]\njobId=%s\nrows=%s\nsell=%s\ncost=%s\nstatus=%s",
    jobId,
    rowCount,
    sellTotal.toFixed(2),
    costTotal.toFixed(2),
    status
  );
}
