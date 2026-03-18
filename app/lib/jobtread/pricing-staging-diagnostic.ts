/**
 * Dev-only diagnostic: one-job reconciliation of staged totals vs row-level buckets.
 * Explains why app staged cost/sell may differ from JobTread UI.
 * No changes to pricing logic.
 */

import { prisma } from "@/app/lib/prisma";
import { looksLikeCostCodeName } from "@/app/lib/jobtread/cost-code-heuristics";
import { deriveRoomAndTradeFromGroupName } from "@/app/lib/jobtread/pricing-normalization";

type RawBudgetGroup = { id: string; name: string; parentId?: string | null };

function getGroupsFromRawBudgetJson(raw: unknown): RawBudgetGroup[] | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const groups = obj.groups;
  if (!Array.isArray(groups)) return null;
  return groups as RawBudgetGroup[];
}

function buildCostGroupRoomTradeResolver(
  groups: RawBudgetGroup[],
): Map<string, { roomName: string; tradeName: string | null }> {
  const byId = new Map<string, RawBudgetGroup>();
  for (const g of groups) {
    if (g.id && g.name) byId.set(g.id, g);
  }
  const result = new Map<string, { roomName: string; tradeName: string | null }>();
  for (const g of groups) {
    if (!g.id || !g.name) continue;
    const parentId = g.parentId ?? null;
    if (parentId == null) {
      result.set(g.id, { roomName: g.name.trim(), tradeName: null });
    } else {
      const parent = byId.get(parentId);
      result.set(g.id, {
        roomName: parent?.name?.trim() ?? "Ungrouped",
        tradeName: g.name.trim(),
      });
    }
  }
  return result;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Same room-assignment logic as staging so we label Ungrouped consistently. */
function getRoomNameForRow(
  row: {
    groupName: string | null;
    costGroupId: string | null;
    parentCostGroupId: string | null;
    parentCostGroupName: string | null;
    itemName: string;
    externalBudgetItemId: string;
  },
  jobId: string,
  groupResolver: Map<string, { roomName: string; tradeName: string | null }> | null,
): string {
  const groupName =
    row.groupName != null && String(row.groupName).trim() !== ""
      ? String(row.groupName).trim()
      : null;
  const costGroupId =
    row.costGroupId != null && String(row.costGroupId).trim() !== ""
      ? String(row.costGroupId).trim()
      : null;
  const parentCostGroupId =
    row.parentCostGroupId != null && String(row.parentCostGroupId).trim() !== ""
      ? String(row.parentCostGroupId).trim()
      : null;
  const parentCostGroupName =
    row.parentCostGroupName != null && String(row.parentCostGroupName).trim() !== ""
      ? String(row.parentCostGroupName).trim()
      : null;

  const hasRowHierarchy = groupName != null || costGroupId != null;
  const groupNameIsCostCode = looksLikeCostCodeName(groupName);
  const parentNameIsCostCode = looksLikeCostCodeName(parentCostGroupName);
  const hierarchyNamesValid =
    hasRowHierarchy &&
    !groupNameIsCostCode &&
    (parentCostGroupId == null ? true : !parentNameIsCostCode);

  if (hierarchyNamesValid) {
    if (parentCostGroupId == null) {
      return groupName ?? "Ungrouped";
    }
    return parentCostGroupName ?? "Ungrouped";
  }
  if (hasRowHierarchy && (groupNameIsCostCode || parentNameIsCostCode)) {
    if (groupResolver && costGroupId) {
      const resolved = groupResolver.get(costGroupId);
      return resolved?.roomName ?? "Ungrouped";
    }
    const derived = deriveRoomAndTradeFromGroupName({
      sourceJobId: jobId,
      sourceGroupId: costGroupId,
      sourceItemId: row.externalBudgetItemId,
      groupName: null,
      itemName: row.itemName,
    });
    return derived.roomName ?? "Ungrouped";
  }
  if (groupResolver && costGroupId) {
    const resolved = groupResolver.get(costGroupId);
    return resolved?.roomName ?? "Ungrouped";
  }
  const legacyGroupName = looksLikeCostCodeName(groupName) ? null : groupName;
  const derived = deriveRoomAndTradeFromGroupName({
    sourceJobId: jobId,
    sourceGroupId: costGroupId,
    sourceItemId: row.externalBudgetItemId,
    groupName: legacyGroupName,
    itemName: row.itemName,
  });
  return derived.roomName ?? "Ungrouped";
}

const TOLERANCE_PLACEHOLDER = 0.01; // 1% for ext ≈ unit (qty=1)

type RowBucket = "normal" | "ungrouped" | "placeholder" | "missing_ext";

type ClassifiedRow = {
  id: string;
  externalBudgetItemId: string;
  itemName: string;
  roomName: string;
  quantity: number | null;
  unitCost: number | null;
  unitPrice: number | null;
  extCost: number;
  extSell: number;
  bucket: RowBucket;
};

function classifyRow(
  row: {
    id: string;
    externalBudgetItemId: string;
    itemName: string;
    groupName: string | null;
    costGroupId: string | null;
    parentCostGroupId: string | null;
    parentCostGroupName: string | null;
    quantity: unknown;
    unitCost: unknown;
    unitPrice: unknown;
    extCost: unknown;
    extSell: unknown;
  },
  roomName: string,
): ClassifiedRow {
  const quantity = toNum(row.quantity);
  const unitCost = toNum(row.unitCost);
  const unitPrice = toNum(row.unitPrice);
  const extCost = toNum(row.extCost) ?? 0;
  const extSell = toNum(row.extSell) ?? 0;

  const isUngrouped = roomName === "Ungrouped";
  const hasUsableExt =
    Number.isFinite(extCost) && Number.isFinite(extSell) && (extCost > 0 || extSell > 0);
  const isMissingExt = !hasUsableExt;

  const qtyMissingOrZero = quantity == null || quantity === 0;
  const extMatchesUnitCost =
    unitCost != null &&
    unitCost !== 0 &&
    Number.isFinite(extCost) &&
    Math.abs(extCost - unitCost) / unitCost <= TOLERANCE_PLACEHOLDER;
  const extMatchesUnitPrice =
    unitPrice != null &&
    unitPrice !== 0 &&
    Number.isFinite(extSell) &&
    Math.abs(extSell - unitPrice) / unitPrice <= TOLERANCE_PLACEHOLDER;
  const isPlaceholder =
    qtyMissingOrZero && (extMatchesUnitCost || extMatchesUnitPrice);

  let bucket: RowBucket = "normal";
  if (isUngrouped) bucket = "ungrouped";
  else if (isPlaceholder) bucket = "placeholder";
  else if (isMissingExt) bucket = "missing_ext";

  return {
    id: row.id,
    externalBudgetItemId: row.externalBudgetItemId,
    itemName: row.itemName,
    roomName,
    quantity,
    unitCost,
    unitPrice,
    extCost,
    extSell,
    bucket,
  };
}

type ScenarioTotals = {
  totalSell: number;
  totalCost: number;
  profit: number;
  marginPct: number | null;
  rowCount: number;
};

function scenarioTotals(rows: ClassifiedRow[], filter: (r: ClassifiedRow) => boolean): ScenarioTotals {
  let totalSell = 0;
  let totalCost = 0;
  let count = 0;
  for (const r of rows) {
    if (!filter(r)) continue;
    totalSell += r.extSell;
    totalCost += r.extCost;
    count += 1;
  }
  const profit = totalSell - totalCost;
  const marginPct = totalSell > 0 ? profit / totalSell : null;
  return { totalSell, totalCost, profit, marginPct, rowCount: count };
}

const FOCUS_JOB_ID = "22PG3RyGrDnQ";
const JOB_NAME = "10 Oak Park";
const JOBTREAD_UI_COST = 135_708.06;
const JOBTREAD_UI_SELL = 249_488.81;

/**
 * Run one-job diagnostic for 22PG3RyGrDnQ (10 Oak Park).
 * Logs to console; call from a dev action or on-demand.
 */
export async function runPricingStagingDiagnostic(
  jobId: string = FOCUS_JOB_ID,
): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const job = await prisma.syncedBudgetJob.findUnique({
    where: { jobId },
    include: { rows: true },
  });

  if (!job) {
    // eslint-disable-next-line no-console
    console.log(`[Pricing diagnostic] Job ${jobId} not found.`);
    return;
  }

  const rawGroups = getGroupsFromRawBudgetJson(job.rawBudgetJson);
  const groupResolver =
    rawGroups && rawGroups.length > 0 ? buildCostGroupRoomTradeResolver(rawGroups) : null;

  const classified: ClassifiedRow[] = [];
  for (const row of job.rows) {
    const roomName = getRoomNameForRow(
      {
        groupName: row.groupName,
        costGroupId: row.costGroupId,
        parentCostGroupId: row.parentCostGroupId,
        parentCostGroupName: row.parentCostGroupName,
        itemName: row.itemName,
        externalBudgetItemId: row.externalBudgetItemId,
      },
      job.jobId,
      groupResolver,
    );
    classified.push(
      classifyRow(
        {
          id: row.id,
          externalBudgetItemId: row.externalBudgetItemId,
          itemName: row.itemName,
          groupName: row.groupName,
          costGroupId: row.costGroupId,
          parentCostGroupId: row.parentCostGroupId,
          parentCostGroupName: row.parentCostGroupName,
          quantity: row.quantity,
          unitCost: row.unitCost,
          unitPrice: row.unitPrice,
          extCost: row.extCost,
          extSell: row.extSell,
        },
        roomName,
      ),
    );
  }

  const ungrouped = classified.filter((r) => r.bucket === "ungrouped");
  const placeholder = classified.filter((r) => r.bucket === "placeholder");
  const missingExt = classified.filter((r) => r.bucket === "missing_ext");
  const normal = classified.filter((r) => r.bucket === "normal");

  const scenarioA = scenarioTotals(classified, () => true);
  const scenarioB = scenarioTotals(classified, (r) => r.bucket !== "ungrouped");
  const scenarioC = scenarioTotals(
    classified,
    (r) => Number.isFinite(r.extCost) && r.extCost > 0 && Number.isFinite(r.extSell) && r.extSell > 0,
  );
  const scenarioD = scenarioTotals(
    classified,
    (r) =>
      r.bucket !== "ungrouped" &&
      Number.isFinite(r.extCost) &&
      r.extCost > 0 &&
      Number.isFinite(r.extSell) &&
      r.extSell > 0,
  );

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n: number | null) => (n != null ? `${(n * 100).toFixed(2)}%` : "—");

  // ---------- Section 1: Header & reference ----------
  // eslint-disable-next-line no-console
  console.log(`
========== PRICING STAGING DIAGNOSTIC ==========
Job: ${job.jobName} (${jobId})
Synced rows: ${classified.length}

Reference (JobTread UI):
  Sell:   ${fmt(JOBTREAD_UI_SELL)}
  Cost:   ${fmt(JOBTREAD_UI_COST)}
  Profit: ${fmt(JOBTREAD_UI_SELL - JOBTREAD_UI_COST)}
  Margin: ${pct((JOBTREAD_UI_SELL - JOBTREAD_UI_COST) / JOBTREAD_UI_SELL)}
================================================
`);

  // ---------- Section 2: Row buckets ----------
  // eslint-disable-next-line no-console
  console.log(`
--- ROW BUCKETS ---
  Normal (explicit ext, valid hierarchy, not Ungrouped): ${normal.length}
  Ungrouped:   ${ungrouped.length}
  Placeholder (qty missing/zero, ext ≈ unit): ${placeholder.length}
  Missing-ext (no usable extCost/extSell):    ${missingExt.length}
`);

  // ---------- Section 3: Scenario totals ----------
  // eslint-disable-next-line no-console
  console.log(`
--- SCENARIO TOTALS ---
  Scenario A — Current staged (all rows):
    totalSell: ${fmt(scenarioA.totalSell)}  totalCost: ${fmt(scenarioA.totalCost)}
    profit: ${fmt(scenarioA.profit)}  margin: ${pct(scenarioA.marginPct)}  (rows: ${scenarioA.rowCount})

  Scenario B — Exclude Ungrouped:
    totalSell: ${fmt(scenarioB.totalSell)}  totalCost: ${fmt(scenarioB.totalCost)}
    profit: ${fmt(scenarioB.profit)}  margin: ${pct(scenarioB.marginPct)}  (rows: ${scenarioB.rowCount})

  Scenario C — Only rows with explicit extCost/extSell (both > 0):
    totalSell: ${fmt(scenarioC.totalSell)}  totalCost: ${fmt(scenarioC.totalCost)}
    profit: ${fmt(scenarioC.profit)}  margin: ${pct(scenarioC.marginPct)}  (rows: ${scenarioC.rowCount})

  Scenario D — Explicit ext + exclude Ungrouped:
    totalSell: ${fmt(scenarioD.totalSell)}  totalCost: ${fmt(scenarioD.totalCost)}
    profit: ${fmt(scenarioD.profit)}  margin: ${pct(scenarioD.marginPct)}  (rows: ${scenarioD.rowCount})
`);

  // ---------- Section 4: Cost delta vs JobTread UI ----------
  // eslint-disable-next-line no-console
  console.log(`
--- COST vs JOBTREAD UI (${fmt(JOBTREAD_UI_COST)}) ---
  Scenario A cost delta: ${fmt(scenarioA.totalCost - JOBTREAD_UI_COST)}
  Scenario B cost delta: ${fmt(scenarioB.totalCost - JOBTREAD_UI_COST)}
  Scenario C cost delta: ${fmt(scenarioC.totalCost - JOBTREAD_UI_COST)}
  Scenario D cost delta: ${fmt(scenarioD.totalCost - JOBTREAD_UI_COST)}
`);

  // ---------- Section 5: Top offenders by extCost ----------
  const topN = 25;
  const byExtCost = (a: ClassifiedRow, b: ClassifiedRow) => b.extCost - a.extCost;

  // eslint-disable-next-line no-console
  console.log(`
--- TOP ${topN} UNGROUPED ROWS BY EXT COST ---`);
  ungrouped
    .slice()
    .sort(byExtCost)
    .slice(0, topN)
    .forEach((r, i) => {
      // eslint-disable-next-line no-console
      console.log(
        `  ${i + 1}. extCost=${fmt(r.extCost)} extSell=${fmt(r.extSell)}  itemName="${(r.itemName || "").slice(0, 50)}"`,
      );
    });

  // eslint-disable-next-line no-console
  console.log(`
--- TOP ${topN} PLACEHOLDER ROWS BY EXT COST ---`);
  placeholder
    .slice()
    .sort(byExtCost)
    .slice(0, topN)
    .forEach((r, i) => {
      // eslint-disable-next-line no-console
      console.log(
        `  ${i + 1}. extCost=${fmt(r.extCost)} extSell=${fmt(r.extSell)} qty=${r.quantity ?? "null"}  itemName="${(r.itemName || "").slice(0, 50)}"`,
      );
    });

  // eslint-disable-next-line no-console
  console.log(`
--- TOP ${topN} MISSING-EXT ROWS (nontrivial: has unitCost or unitPrice) BY EXT COST ---`);
  const missingExtNontrivial = missingExt.filter(
    (r) => (r.unitCost != null && r.unitCost !== 0) || (r.unitPrice != null && r.unitPrice !== 0),
  );
  missingExtNontrivial
    .slice()
    .sort(byExtCost)
    .slice(0, topN)
    .forEach((r, i) => {
      // eslint-disable-next-line no-console
      console.log(
        `  ${i + 1}. extCost=${fmt(r.extCost)} extSell=${fmt(r.extSell)} unitCost=${r.unitCost ?? "—"} unitPrice=${r.unitPrice ?? "—"}  itemName="${(r.itemName || "").slice(0, 50)}"`,
      );
    });

  // ---------- Section 6: Room-level variance summary ----------
  const roomMap = new Map<
    string,
    {
      totalSell: number;
      totalCost: number;
      rowCount: number;
      ungroupedCount: number;
      placeholderCount: number;
      missingExtCount: number;
    }
  >();
  for (const r of classified) {
    const cur = roomMap.get(r.roomName) ?? {
      totalSell: 0,
      totalCost: 0,
      rowCount: 0,
      ungroupedCount: 0,
      placeholderCount: 0,
      missingExtCount: 0,
    };
    cur.totalSell += r.extSell;
    cur.totalCost += r.extCost;
    cur.rowCount += 1;
    if (r.bucket === "ungrouped") cur.ungroupedCount += 1;
    if (r.bucket === "placeholder") cur.placeholderCount += 1;
    if (r.bucket === "missing_ext") cur.missingExtCount += 1;
    roomMap.set(r.roomName, cur);
  }

  // eslint-disable-next-line no-console
  console.log(`
--- ROOM-LEVEL VARIANCE (staged room names from row assignment) ---`);
  const rooms = Array.from(roomMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [roomName, stats] of rooms) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${roomName}: totalSell=${fmt(stats.totalSell)} totalCost=${fmt(stats.totalCost)} rows=${stats.rowCount} ungrouped=${stats.ungroupedCount} placeholder=${stats.placeholderCount} missingExt=${stats.missingExtCount}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`
========== END DIAGNOSTIC ==========
`);
}

// --- Duplication diagnostic for 125 South Shore #1302 (22PJXd2cjdhN) ---
const DUPLICATION_DIAG_JOB_ID = "22PJXd2cjdhN";

/**
 * Run duplication diagnostic for 22PJXd2cjdhN (125 South Shore #1302).
 * Determines whether doubling is from duplicate synced rows, duplicate staging rows, or rollup logic.
 * Diagnostic only; no business logic changes.
 */
export async function runDuplicationDiagnostic(
  jobId: string = DUPLICATION_DIAG_JOB_ID,
): Promise<string> {
  const summaryParts: string[] = [];

  if (process.env.NODE_ENV === "production") {
    return "Duplication diagnostic skipped in production.";
  }

  const job = await prisma.syncedBudgetJob.findUnique({
    where: { jobId },
    include: { rows: true },
  });

  if (!job) {
    const msg = `[Duplication diagnostic] Job ${jobId} not found.`;
    // eslint-disable-next-line no-console
    console.log(msg);
    return msg;
  }

  const rows = job.rows;
  const rowCount = rows.length;

  // 1) Row and item id stats
  const itemIdCounts = new Map<string, number>();
  for (const r of rows) {
    const id = r.externalBudgetItemId;
    itemIdCounts.set(id, (itemIdCounts.get(id) ?? 0) + 1);
  }
  const distinctItemIds = itemIdCounts.size;
  const duplicateItemIds = Array.from(itemIdCounts.entries()).filter(([, c]) => c > 1);
  const duplicateCount = duplicateItemIds.reduce((s, [, c]) => s + c, 0);

  const topDuplicated = duplicateItemIds
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id, c]) => ({ id, count: c }));

  // Group counts: by costGroupId, parentCostGroupId, itemName
  const byCostGroupId = new Map<string, number>();
  const byParentCostGroupId = new Map<string, number>();
  const byItemName = new Map<string, number>();
  for (const r of rows) {
    const cg = r.costGroupId ?? "(null)";
    const pcg = r.parentCostGroupId ?? "(null)";
    const name = r.itemName ?? "(null)";
    byCostGroupId.set(cg, (byCostGroupId.get(cg) ?? 0) + 1);
    byParentCostGroupId.set(pcg, (byParentCostGroupId.get(pcg) ?? 0) + 1);
    byItemName.set(name, (byItemName.get(name) ?? 0) + 1);
  }

  // Same item (externalBudgetItemId) more than once with identical extCost/extSell
  const byItemAndExt = new Map<string, { extCost: number; extSell: number; count: number }>();
  for (const r of rows) {
    const ec = toNum(r.extCost) ?? 0;
    const es = toNum(r.extSell) ?? 0;
    const key = `${r.externalBudgetItemId}|${ec}|${es}`;
    const cur = byItemAndExt.get(key);
    if (!cur) byItemAndExt.set(key, { extCost: ec, extSell: es, count: 1 });
    else cur.count += 1;
  }
  const identicalExtDuplicates = Array.from(byItemAndExt.entries()).filter(([, v]) => v.count > 1);

  // 2) Financial comparison buckets
  let sumAllSell = 0;
  let sumAllCost = 0;
  for (const r of rows) {
    sumAllSell += toNum(r.extSell) ?? 0;
    sumAllCost += toNum(r.extCost) ?? 0;
  }

  // Distinct externalBudgetItemId only: take first occurrence per id
  const firstByItemId = new Map<string, { extCost: number; extSell: number }>();
  for (const r of rows) {
    if (firstByItemId.has(r.externalBudgetItemId)) continue;
    firstByItemId.set(r.externalBudgetItemId, {
      extCost: toNum(r.extCost) ?? 0,
      extSell: toNum(r.extSell) ?? 0,
    });
  }
  let sumDistinctSell = 0;
  let sumDistinctCost = 0;
  for (const v of firstByItemId.values()) {
    sumDistinctSell += v.extSell;
    sumDistinctCost += v.extCost;
  }

  // Rows that would be included in staging rollups (both ext > 0)
  let sumStagingSell = 0;
  let sumStagingCost = 0;
  for (const r of rows) {
    const ec = toNum(r.extCost) ?? 0;
    const es = toNum(r.extSell) ?? 0;
    if (ec > 0 && es > 0) {
      sumStagingCost += ec;
      sumStagingSell += es;
    }
  }

  // Final PricingSourceJob totals for this job
  const stagedJob = await prisma.pricingSourceJob.findUnique({
    where: { jobId },
    select: { totalCost: true, totalSell: true },
  });
  const jobStoredCost = stagedJob ? toNum(stagedJob.totalCost) ?? 0 : null;
  const jobStoredSell = stagedJob ? toNum(stagedJob.totalSell) ?? 0 : null;

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // 3 & 4) Staged room/trade counts and duplicate keys
  const stagedRooms = await prisma.pricingSourceRoom.findMany({
    where: { jobId },
    select: { id: true, roomName: true, roomKey: true, totalCost: true, totalSell: true },
  });
  const stagedTrades = await prisma.pricingSourceTrade.findMany({
    where: { jobId },
    select: { roomId: true, room: { select: { roomName: true } }, tradeName: true, totalCost: true, totalSell: true },
  });

  const roomKeys = stagedRooms.map((r) => `${jobId}|${r.roomName}`);
  const roomKeyCounts = new Map<string, number>();
  for (const k of roomKeys) {
    roomKeyCounts.set(k, (roomKeyCounts.get(k) ?? 0) + 1);
  }
  const duplicateRoomKeys = Array.from(roomKeyCounts.entries()).filter(([, c]) => c > 1);

  const tradeKeys = stagedTrades.map((t) => `${jobId}|${t.room.roomName}|${t.tradeName}`);
  const tradeKeyCounts = new Map<string, number>();
  for (const k of tradeKeys) {
    tradeKeyCounts.set(k, (tradeKeyCounts.get(k) ?? 0) + 1);
  }
  const duplicateTradeKeys = Array.from(tradeKeyCounts.entries()).filter(([, c]) => c > 1);

  let sumRoomCost = 0;
  let sumRoomSell = 0;
  for (const r of stagedRooms) {
    sumRoomCost += toNum(r.totalCost) ?? 0;
    sumRoomSell += toNum(r.totalSell) ?? 0;
  }
  let sumTradeCost = 0;
  let sumTradeSell = 0;
  for (const t of stagedTrades) {
    sumTradeCost += toNum(t.totalCost) ?? 0;
    sumTradeSell += toNum(t.totalSell) ?? 0;
  }

  // ----- Console output -----
  // eslint-disable-next-line no-console
  console.log(`
========== DUPLICATION DIAGNOSTIC (125 South Shore #1302) ==========
Job: ${job.jobName} (${jobId})

--- 1) SYNCED ROW & ITEM ID ---
  SyncedBudgetRow count:           ${rowCount}
  Distinct externalBudgetItemId:  ${distinctItemIds}
  Duplicate externalBudgetItemId: ${duplicateCount} rows (${duplicateItemIds.length} ids repeated)
  Top duplicated item ids (id → count):
${topDuplicated.map(({ id, count }) => `    ${id} → ${count}`).join("\n")}

  Rows by costGroupId (sample, first 10):
${Array.from(byCostGroupId.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, c]) => `    ${k}: ${c}`).join("\n")}
  Rows by parentCostGroupId (sample, first 10):
${Array.from(byParentCostGroupId.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, c]) => `    ${k}: ${c}`).join("\n")}
  Rows by itemName (sample, first 10):
${Array.from(byItemName.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, c]) => `    "${k.slice(0, 40)}": ${c}`).join("\n")}

  Same item + identical extCost/extSell (count > 1): ${identicalExtDuplicates.length} keys, ${identicalExtDuplicates.reduce((s, [, v]) => s + v.count, 0)} total rows
${identicalExtDuplicates.length > 0 ? identicalExtDuplicates.slice(0, 5).map(([k, v]) => `    ${k.slice(0, 60)} → ${v.count}`).join("\n") : "    (none)"}

--- 2) FINANCIAL COMPARISON BUCKETS ---
  Sum all synced rows:           sell=${fmt(sumAllSell)}  cost=${fmt(sumAllCost)}
  Sum distinct externalBudgetItemId (first per id): sell=${fmt(sumDistinctSell)}  cost=${fmt(sumDistinctCost)}
  Sum rows in staging rollups (both ext>0):         sell=${fmt(sumStagingSell)}  cost=${fmt(sumStagingCost)}
  PricingSourceJob stored:       sell=${jobStoredSell != null ? fmt(jobStoredSell) : "—"}  cost=${jobStoredCost != null ? fmt(jobStoredCost) : "—"}

  Reference (JobTread UI):       sell ≈ 864,977.80   cost ≈ 532,264.20
  Reference (DataX summary):     sell ≈ 865,121.50   cost ≈ 532,318.79

--- 3) JOB TOTAL SOURCE (see rebuild log) ---
  Job total is computed from: sum of room totals (room.totalCost / room.totalSell).
  Trade totals are NOT added to job; they are children of rooms.

--- 4) STAGED ROOM/TRADE COUNTS & DUPLICATE KEYS ---
  Staged room rows:  ${stagedRooms.length}
  Staged trade rows: ${stagedTrades.length}
  Sum of room totals:   sell=${fmt(sumRoomSell)}  cost=${fmt(sumRoomCost)}
  Sum of trade totals:  sell=${fmt(sumTradeSell)}  cost=${fmt(sumTradeCost)}
  Duplicate (jobId+roomName):     ${duplicateRoomKeys.length}
  Duplicate (jobId+roomName+tradeName): ${duplicateTradeKeys.length}
${duplicateRoomKeys.length > 0 ? `  Duplicate room keys: ${duplicateRoomKeys.map(([k]) => k).join(", ")}` : ""}
${duplicateTradeKeys.length > 0 ? `  Duplicate trade keys (sample): ${duplicateTradeKeys.slice(0, 5).map(([k]) => k).join(", ")}` : ""}

========== END DUPLICATION DIAGNOSTIC ==========
`);

  // Plain-English summary
  const hasDupSync = rowCount > distinctItemIds;
  const hasDupStagingRooms = duplicateRoomKeys.length > 0;
  const hasDupStagingTrades = duplicateTradeKeys.length > 0;
  const jobVsExpected = jobStoredSell != null && jobStoredCost != null
    ? (jobStoredSell > 1.5 * 864977 || jobStoredCost > 1.5 * 532264)
    : false;

  summaryParts.push(`Source row count: ${rowCount}. Distinct item count: ${distinctItemIds}.`);
  if (hasDupSync) {
    summaryParts.push(`Duplication in sync: YES (${duplicateCount} duplicate rows across ${duplicateItemIds.length} item ids).`);
  } else {
    summaryParts.push(`Duplication in sync: NO (row count equals distinct item count).`);
  }
  if (hasDupStagingRooms) summaryParts.push(`Duplicate staged room keys: YES.`);
  else summaryParts.push(`Duplicate staged room keys: NO.`);
  if (hasDupStagingTrades) summaryParts.push(`Duplicate staged trade keys: YES.`);
  else summaryParts.push(`Duplicate staged trade keys: NO.`);
  if (jobVsExpected) {
    summaryParts.push(`Job stored total is ~2x expected; doubling likely from ${hasDupSync ? "synced duplicate rows" : hasDupStagingRooms || hasDupStagingTrades ? "duplicate staging rows or double rollup" : "rollup (e.g. parent+child both contributing)."}`);
  }
  const summary = summaryParts.join(" ");
  // eslint-disable-next-line no-console
  console.log("[Duplication diagnostic] Summary:", summary);
  return summary;
}
