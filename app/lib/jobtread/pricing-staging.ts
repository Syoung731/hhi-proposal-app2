import { prisma } from "@/app/lib/prisma";
import {
  createNormalizationStatsCollector,
  deriveRoomAndTradeFromGroupName,
  detectCopeSqFt,
  detectFlooringSqFt,
  finalizeNormalizationStats,
  recordNormalizationResult,
  type SqFtDetection,
} from "@/app/lib/jobtread/pricing-normalization";
import { looksLikeCostCodeName } from "@/app/lib/jobtread/cost-code-heuristics";
import { DEBUG_JOBTREAD_SYNC } from "@/app/lib/jobtread/debug";

/** Cost group shape stored in SyncedBudgetJob.rawBudgetJson (NormalizedJobBudget.groups). */
type RawBudgetGroup = { id: string; name: string; parentId?: string | null };

/**
 * Build a map from costGroupId -> { roomName, tradeName } using the JobTread hierarchy:
 * - Room = top-level cost group (parentCostGroupId == null)
 * - Trade = child cost group (parentCostGroupId != null)
 */
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
      const roomName = parent?.name?.trim() ?? "Ungrouped";
      result.set(g.id, { roomName, tradeName: g.name.trim() });
    }
  }
  return result;
}

/** Parse groups array from SyncedBudgetJob.rawBudgetJson (NormalizedJobBudget). */
function getGroupsFromRawBudgetJson(
  raw: unknown,
): RawBudgetGroup[] | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const groups = obj.groups;
  if (!Array.isArray(groups)) return null;
  return groups as RawBudgetGroup[];
}

/**
 * Normalize Prisma.Decimal-like values (or other numeric wrappers) to plain numbers.
 * Returns null when the value is null/undefined or cannot be safely converted.
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

type RoomAggregation = {
  roomName: string;
  roomKey: string;
  rows: {
    groupName: string | null;
    itemName: string;
    quantity: number | null;
    extCost: number;
    extSell: number;
  }[];
  trades: Map<string, { totalCost: number; totalSell: number; itemCount: number }>;
  totalCost: number;
  totalSell: number;
};

type AutoSectionTypeMapping = {
  normalizedRoomName: string | null;
  sectionTypeId: string | null;
  sectionTypeSource: "auto" | null;
};

function autoMapSectionTypeForRoom(
  roomName: string,
  sectionTypes: { id: string; name: string }[],
): AutoSectionTypeMapping {
  const lower = roomName.toLowerCase();

  const byName = new Map(sectionTypes.map((st) => [st.name.toLowerCase(), st]));

  function pick(name: string): AutoSectionTypeMapping {
    const st = byName.get(name.toLowerCase());
    if (!st) {
      return {
        normalizedRoomName: null,
        sectionTypeId: null,
        sectionTypeSource: null,
      };
    }
    return {
      normalizedRoomName: st.name,
      sectionTypeId: st.id,
      sectionTypeSource: "auto",
    };
  }

  if (lower.includes("bath")) {
    return pick("Bathroom");
  }
  if (lower.includes("kitchen")) {
    return pick("Kitchen");
  }
  if (lower.includes("living") || lower.includes("family") || lower.includes("great room")) {
    return pick("Living Room");
  }
  if (lower.includes("bed")) {
    return pick("Bedroom");
  }
  if (lower.includes("dining")) {
    return pick("Dining");
  }
  if (lower.includes("hall")) {
    return pick("Hallway");
  }
  if (lower.includes("laundry")) {
    return pick("Laundry");
  }
  if (lower.includes("pantry")) {
    return pick("Pantry");
  }
  if (lower.includes("deck")) {
    return pick("Deck");
  }
  if (lower.includes("porch")) {
    return pick("Screened Porch");
  }
  if (lower.includes("exterior")) {
    return pick("Exterior Paint");
  }
  if (lower.includes("roof")) {
    return pick("Roof");
  }
  if (lower.includes("landscap")) {
    return pick("Landscaping");
  }

  return {
    normalizedRoomName: null,
    sectionTypeId: null,
    sectionTypeSource: null,
  };
}

export type RebuildPricingStagingOptions = {
  /** When set, only these jobs are rebuilt; others are left unchanged. Omit for full rebuild. */
  jobIds?: string[];
};

export async function rebuildPricingStaging(
  options?: RebuildPricingStagingOptions
): Promise<{
  jobsCount: number;
  roomsCount: number;
  tradesCount: number;
  scope: "full" | "jobs";
  classificationSummary: {
    buildJobsFound: number;
    buildJobsIncluded: number;
    jobsSynced: number;
    syncedBudgetRowsWritten: number;
    unchangedCount: number;
  };
}> {
  const jobIds = options?.jobIds?.length ? options.jobIds : undefined;
  const scope = jobIds ? "jobs" : "full";

  const normalizationStats = createNormalizationStatsCollector();
  const [jobs, sectionTypes] = await Promise.all([
    prisma.syncedBudgetJob.findMany({
      where: jobIds ? { jobId: { in: jobIds } } : undefined,
      orderBy: { jobName: "asc" },
      include: { rows: true },
    }),
    prisma.sectionType.findMany({
      select: { id: true, name: true },
    }),
  ]);

  // Precompute all staging data in memory to keep the DB transaction short.
  const jobsToInsert: {
    id: string;
    jobId: string;
    jobName: string;
    jobNumber: string | null;
    includeInPricing: boolean;
    sourceLastSyncedAt: Date | null;
    totalCost: number;
    totalSell: number;
  }[] = [];

  const roomsToInsert: {
    id: string;
    jobId: string;
    pricingJobId: string;
    roomKey: string;
    roomName: string;
    normalizedRoomName: string | null;
    sectionTypeId: string | null;
    sectionTypeSource: string | null;
    includeInPricing: boolean;
    autoDetectedSqFt: number | null;
    manualSqFtOverride: number | null;
    totalCost: number;
    totalSell: number;
    costPerSqFt: number | null;
    sellPerSqFt: number | null;
    sqFtSource: string | null;
    hasValidSqFt: boolean;
  }[] = [];

  const tradesToInsert: {
    jobId: string;
    roomId: string;
    tradeName: string;
    totalCost: number;
    totalSell: number;
  }[] = [];

  let roomsCount = 0;
  let tradesCount = 0;

  // For debug logging: pick first job to log Job → Room → Trade hierarchy.
  let debugJobId: string | null = null;

  for (const job of jobs) {
    // Use a deterministic ID so rooms and trades can reference it without
    // relying on DB-generated IDs.
    const stagingJobId = `job:${job.jobId}`;

    const roomByKey = new Map<string, RoomAggregation>();

    // Debug logging for hierarchy/cost-code issues (one job: 10 Oak Park).
    const DEBUG_JOB_ID = "22PG3RyGrDnQ";
    const DUPLICATION_DIAG_JOB_ID = "22PJXd2cjdhN"; // 125 South Shore #1302
    const debugSamples: {
      fallbackRoom: { groupName: string | null; costCode: string | null; costCodeName: string | null; roomName: string; reason: string }[];
      costCodeConsidered: { groupName: string | null; costCode: string | null; costCodeName: string | null }[];
      topLevelBuckets: string[];
    } = { fallbackRoom: [], costCodeConsidered: [], topLevelBuckets: [] };

    // Fallback: rawBudgetJson groups (when row hierarchy fields not yet populated).
    const rawGroups = getGroupsFromRawBudgetJson(job.rawBudgetJson);
    const groupResolver =
      rawGroups && rawGroups.length > 0
        ? buildCostGroupRoomTradeResolver(rawGroups)
        : null;

    // For diagnostic job: accumulate "old" totals (all rows) to log vs new (explicit-ext only).
    let oldJobCost = 0;
    let oldJobSell = 0;

    for (const row of job.rows) {
      const groupName =
        row.groupName != null && String(row.groupName).trim() !== ""
          ? String(row.groupName).trim()
          : null;
      const costGroupId =
        row.costGroupId != null && String(row.costGroupId).trim() !== ""
          ? String(row.costGroupId).trim()
          : null;
      const parentCostGroupId =
        row.parentCostGroupId != null &&
        String(row.parentCostGroupId).trim() !== ""
          ? String(row.parentCostGroupId).trim()
          : null;
      const parentCostGroupName =
        row.parentCostGroupName != null &&
        String(row.parentCostGroupName).trim() !== ""
          ? String(row.parentCostGroupName).trim()
          : null;

      let roomName: string;
      let roomKey: string;
      let tradeName: string | null;
      let usedHierarchy = false;
      let usedFallbackReason: string | null = null;

      // 1) Hierarchy-first: use row's cost group + parent (synced from JobTread) only when
      //    the names are real room/trade names. Item-level costCode names (e.g. "43M Interior Paint - Material")
      //    must never be used as room or trade — costCode stays item-level only.
      const hasRowHierarchy = groupName != null || costGroupId != null;
      const groupNameIsCostCode = looksLikeCostCodeName(groupName);
      const parentNameIsCostCode = looksLikeCostCodeName(parentCostGroupName);
      const hierarchyNamesValid =
        hasRowHierarchy &&
        !groupNameIsCostCode &&
        (parentCostGroupId == null ? true : !parentNameIsCostCode);

      if (hierarchyNamesValid) {
        if (parentCostGroupId == null) {
          roomName = groupName ?? "Ungrouped";
          tradeName = null;
        } else {
          roomName = parentCostGroupName ?? "Ungrouped";
          tradeName = groupName ?? null;
        }
        roomKey = `${job.jobId}::${roomName}`;
        usedHierarchy = true;
      } else if (hasRowHierarchy && (groupNameIsCostCode || parentNameIsCostCode)) {
        usedFallbackReason = "groupName or parentCostGroupName looks like cost code";
        if (groupResolver && costGroupId) {
          const resolved = groupResolver.get(costGroupId);
          if (resolved) {
            roomName = resolved.roomName;
            tradeName = resolved.tradeName;
          } else {
            roomName = "Ungrouped";
            tradeName = null;
          }
          roomKey = `${job.jobId}::${roomName}`;
        } else {
          const derived = deriveRoomAndTradeFromGroupName({
            sourceJobId: job.jobId,
            sourceGroupId: costGroupId,
            sourceItemId: row.externalBudgetItemId,
            groupName: null,
            itemName: row.itemName,
          });
          roomName = derived.roomName ?? "Ungrouped";
          roomKey = derived.roomKey ?? `${job.jobId}::${roomName}`;
          tradeName = derived.tradeName;
        }
      } else if (groupResolver && costGroupId) {
        // 2) Fallback: resolve from job.rawBudgetJson.groups when row has no hierarchy fields (e.g. legacy sync).
        usedFallbackReason = "resolved from rawBudgetJson.groups";
        const resolved = groupResolver.get(costGroupId);
        if (resolved) {
          roomName = resolved.roomName;
          tradeName = resolved.tradeName;
        } else {
          roomName = "Ungrouped";
          tradeName = null;
        }
        roomKey = `${job.jobId}::${roomName}`;
      } else {
        // 3) Legacy: parse groupName string (e.g. "Kitchen > Electrical") only when it's not a cost code.
        usedFallbackReason = "legacy groupName parse";
        const legacyGroupName = looksLikeCostCodeName(groupName) ? null : groupName;
        const derived = deriveRoomAndTradeFromGroupName({
          sourceJobId: job.jobId,
          sourceGroupId: costGroupId,
          sourceItemId: row.externalBudgetItemId,
          groupName: legacyGroupName,
          itemName: row.itemName,
        });
        roomName = derived.roomName ?? "Ungrouped";
        roomKey = derived.roomKey ?? `${job.jobId}::${roomName}`;
        tradeName = derived.tradeName;
      }

      if (job.jobId === DEBUG_JOB_ID) {
        const costCode = row.costCode != null ? String(row.costCode).trim() : null;
        const costCodeName = row.costCodeName != null ? String(row.costCodeName).trim() : null;
        if (usedFallbackReason && debugSamples.fallbackRoom.length < 5) {
          debugSamples.fallbackRoom.push({
            groupName,
            costCode,
            costCodeName,
            roomName,
            reason: usedFallbackReason,
          });
        }
        if ((groupNameIsCostCode ?? false) || (parentNameIsCostCode ?? false)) {
          if (debugSamples.costCodeConsidered.length < 5) {
            debugSamples.costCodeConsidered.push({
              groupName,
              costCode,
              costCodeName,
            });
          }
        }
      }

      recordNormalizationResult({
        stats: normalizationStats,
        jobId: job.jobId,
        rawGroupName: groupName,
        kind: "item",
        result: {
          sourceJobId: job.jobId,
          sourceGroupId: costGroupId,
          sourceItemId: row.externalBudgetItemId,
          roomName,
          roomKey,
          tradeName,
          classificationConfidence: "high",
          parseWarnings: [],
          isUnmapped: roomName === "Ungrouped",
        },
      });

      let agg = roomByKey.get(roomKey);
      if (!agg) {
        agg = {
          roomName,
          roomKey,
          rows: [],
          trades: new Map(),
          totalCost: 0,
          totalSell: 0,
        };
        roomByKey.set(roomKey, agg);
      }

      const quantity =
        row.quantity != null ? Number(row.quantity.toString()) : null;
      const extCostNum = Number(row.extCost.toString());
      const extSellNum = Number(row.extSell.toString());

      agg.rows.push({
        groupName,
        itemName: row.itemName,
        quantity,
        extCost: extCostNum,
        extSell: extSellNum,
      });

      // Totals: only include rows with both extCost > 0 and extSell > 0 (Scenario C / explicit ext).
      // Rows with either zero stay in hierarchy but do not contribute to financial totals.
      const safeCost = Number.isFinite(extCostNum) ? extCostNum : 0;
      const safeSell = Number.isFinite(extSellNum) ? extSellNum : 0;
      const hasExplicitExt = safeCost > 0 && safeSell > 0;
      if (hasExplicitExt) {
        agg.totalCost += safeCost;
        agg.totalSell += safeSell;
      }

      const effectiveTradeName = tradeName ?? "(No trade)";
      const existing = agg.trades.get(effectiveTradeName) ?? {
        totalCost: 0,
        totalSell: 0,
        itemCount: 0,
      };
      if (hasExplicitExt) {
        existing.totalCost += safeCost;
        existing.totalSell += safeSell;
      }
      existing.itemCount += 1;
      agg.trades.set(effectiveTradeName, existing);

      if (job.jobId === DEBUG_JOB_ID) {
        oldJobCost += safeCost;
        oldJobSell += safeSell;
      }
    }

    if (DEBUG_JOBTREAD_SYNC && job.jobId === DEBUG_JOB_ID) {
      for (const agg of roomByKey.values()) {
        if (looksLikeCostCodeName(agg.roomName)) {
          debugSamples.topLevelBuckets.push(agg.roomName);
        }
      }
    }

    // Job-level totals: sum of all staged room/trade aggregates for this job.
    let jobTotalCost = 0;
    let jobTotalSell = 0;
    for (const agg of roomByKey.values()) {
      jobTotalCost += agg.totalCost;
      jobTotalSell += agg.totalSell;
    }
    jobsToInsert.push({
      id: stagingJobId,
      jobId: job.jobId,
      jobName: job.jobName,
      jobNumber: job.jobNumber ?? null,
      includeInPricing: false,
      sourceLastSyncedAt: job.lastSyncedAt ?? null,
      totalCost: jobTotalCost,
      totalSell: jobTotalSell,
    });

    if (process.env.NODE_ENV !== "production") {
      // Per-job staging quality snapshot.
      let ungroupedRowCount = 0;
      let rowsMissingTrade = 0;
      for (const agg of roomByKey.values()) {
        const isUngroupedRoom = agg.roomName === "Ungrouped";
        if (isUngroupedRoom) {
          ungroupedRowCount += agg.rows.length;
        }
        const noTrade = agg.trades.get("(No trade)");
        if (noTrade) {
          rowsMissingTrade += noTrade.itemCount;
        }
      }
      const unmappedRowCount = ungroupedRowCount;
      // eslint-disable-next-line no-console
      console.log("[JobTread pricing][staging][quality]", {
        jobId: job.jobId,
        jobName: job.jobName,
        unmappedRowCount,
        ungroupedRowCount,
        rowsMissingTrade,
      });
    }

    if (DEBUG_JOBTREAD_SYNC && job.jobId === DEBUG_JOB_ID && process.env.NODE_ENV !== "production") {
      const roomCount = roomByKey.size;
      let tradeCount = 0;
      for (const agg of roomByKey.values()) {
        for (const [tname] of agg.trades) {
          if (tname !== "(No trade)") tradeCount += 1;
        }
      }
      // eslint-disable-next-line no-console
      console.log("[JobTread pricing][staging] 10 Oak Park (22PG3RyGrDnQ) totals:", {
        oldLogic_allRows: { totalSell: oldJobSell, totalCost: oldJobCost },
        newLogic_explicitExtOnly: { totalSell: jobTotalSell, totalCost: jobTotalCost },
        roomCount,
        tradeCount,
      });
    }

    // Duplication diagnostic: 125 South Shore #1302 — confirm job total source and no parent+child double count.
    if (
      DEBUG_JOBTREAD_SYNC &&
      job.jobId === DUPLICATION_DIAG_JOB_ID &&
      process.env.NODE_ENV !== "production"
    ) {
      let sumRoomCost = 0;
      let sumRoomSell = 0;
      let sumTradeCost = 0;
      let sumTradeSell = 0;
      let roomCount = 0;
      let tradeCount = 0;
      for (const agg of roomByKey.values()) {
        sumRoomCost += agg.totalCost;
        sumRoomSell += agg.totalSell;
        roomCount += 1;
        for (const [, t] of agg.trades) {
          if (t.totalCost || t.totalSell) {
            sumTradeCost += t.totalCost;
            sumTradeSell += t.totalSell;
            tradeCount += 1;
          }
        }
      }
      // eslint-disable-next-line no-console
      console.log("[JobTread pricing][staging] 125 South Shore (22PJXd2cjdhN) duplication check:", {
        jobTotalFrom: "room totals only (sum of agg.totalCost / agg.totalSell)",
        jobTotalCost: jobTotalCost,
        jobTotalSell: jobTotalSell,
        sumOfRoomTotals: { cost: sumRoomCost, sell: sumRoomSell },
        sumOfTradeTotals: { cost: sumTradeCost, sell: sumTradeSell },
        roomCount,
        tradeCount,
        parentPlusChildNote: "Job total = sum(rooms). Trades are NOT added to job; they are children of rooms. So parent+child do not both contribute to job total.",
      });
    }

    for (const agg of roomByKey.values()) {
      const isCope =
        agg.roomName.trim().toLowerCase() === "cost of project execution";
      const sfDetection = isCope
        ? detectCopeSqFt(agg.rows)
        : detectFlooringSqFt(agg.rows);
      const autoSqFt = sfDetection.sqFt;
      const sqFtSource = sfDetection.source;

      const effectiveSqFt = autoSqFt && autoSqFt > 0 ? autoSqFt : null;
      const hasValidSqFt = effectiveSqFt != null && effectiveSqFt > 0;

      const costPerSqFt =
        hasValidSqFt && agg.totalCost > 0
          ? agg.totalCost / effectiveSqFt!
          : null;
      const sellPerSqFt =
        hasValidSqFt && agg.totalSell > 0
          ? agg.totalSell / effectiveSqFt!
          : null;

      const mapping = autoMapSectionTypeForRoom(agg.roomName, sectionTypes);

      // Deterministic room ID so trades can reference it.
      const roomId = `room:${job.jobId}:${agg.roomKey}`;

      roomsToInsert.push({
        id: roomId,
        jobId: job.jobId,
        pricingJobId: stagingJobId,
        roomKey: agg.roomKey,
        roomName: agg.roomName,
        normalizedRoomName: mapping.normalizedRoomName,
        sectionTypeId: mapping.sectionTypeId,
        sectionTypeSource: mapping.sectionTypeSource,
        includeInPricing: false,
        autoDetectedSqFt: effectiveSqFt,
        manualSqFtOverride: null,
        totalCost: agg.totalCost,
        totalSell: agg.totalSell,
        costPerSqFt,
        sellPerSqFt,
        sqFtSource,
        hasValidSqFt,
      });
      roomsCount += 1;

      for (const [tradeName, t] of agg.trades.entries()) {
        if (tradeName === "(No trade)") continue;
        tradesToInsert.push({
          jobId: job.jobId,
          roomId,
          tradeName,
          totalCost: t.totalCost,
          totalSell: t.totalSell,
        });
        tradesCount += 1;
      }
    }

    // Dev logging: one job — room count, trade count, sample hierarchy (Room → Trade → item count)
    if (
      DEBUG_JOBTREAD_SYNC &&
      process.env.NODE_ENV !== "production" &&
      debugJobId === null &&
      roomByKey.size > 0
    ) {
      debugJobId = job.jobId;
      let jobTradeCount = 0;
      for (const agg of roomByKey.values()) {
        for (const [tname] of agg.trades) {
          if (tname !== "(No trade)") jobTradeCount += 1;
        }
      }
      const lines: string[] = [
        "[JobTread pricing][staging] Debug hierarchy (one job):",
        `  Job: ${job.jobName} (${job.jobId})`,
        `  roomCount: ${roomByKey.size}`,
        `  tradeCount: ${jobTradeCount}`,
        "  sample hierarchy:",
      ];
      for (const agg of roomByKey.values()) {
        lines.push(`    Room: ${agg.roomName}`);
        for (const [tname, t] of agg.trades) {
          if (tname === "(No trade)") continue;
          lines.push(`      Trade: ${tname} → itemCount: ${t.itemCount}`);
        }
      }
      // eslint-disable-next-line no-console
      console.log(lines.join("\n"));
    }

    if (DEBUG_JOBTREAD_SYNC && job.jobId === DEBUG_JOB_ID && process.env.NODE_ENV !== "production") {
      const hasSamples =
        debugSamples.fallbackRoom.length > 0 ||
        debugSamples.costCodeConsidered.length > 0 ||
        debugSamples.topLevelBuckets.length > 0;
      if (hasSamples) {
        // eslint-disable-next-line no-console
        console.log("[JobTread pricing][staging] Debug 22PG3RyGrDnQ (10 Oak Park):", {
          fallbackRoomSamples: debugSamples.fallbackRoom,
          costCodeConsideredSamples: debugSamples.costCodeConsidered,
          topLevelBucketsFromCostCodes: debugSamples.topLevelBuckets,
        });
      }
    }
  }

  const result = {
    jobsCount: jobs.length,
    roomsCount,
    tradesCount,
    scope,
    classificationSummary: {
      buildJobsFound: jobs.length,
      buildJobsIncluded: jobs.length,
      jobsSynced: jobs.length,
      syncedBudgetRowsWritten: jobs.reduce((sum, j) => sum + j.rows.length, 0),
      unchangedCount: 0,
    },
  };

  finalizeNormalizationStats(normalizationStats, {
    phase: "staging",
    jobIds: jobs.map((j) => j.jobId),
    totalGroupsProcessed: 0,
    totalItemsProcessed: jobs.reduce((sum, j) => sum + j.rows.length, 0),
  });

  // Short, batched transaction: clear old rows and bulk-insert new ones.
  // Ensure all numeric fields are plain numbers (no Prisma.Decimal instances).
  const DEBUG_JOB_ID = "22PG3RyGrDnQ";
  const jobsData = jobsToInsert.map((j) => ({
    ...j,
    totalCost: normalizeNumber(j.totalCost) ?? 0,
    totalSell: normalizeNumber(j.totalSell) ?? 0,
  }));

  if (DEBUG_JOBTREAD_SYNC && process.env.NODE_ENV !== "production") {
    const written = jobsData.find((j) => j.jobId === DEBUG_JOB_ID);
    if (written) {
      // eslint-disable-next-line no-console
      console.log("[JobTread pricing][staging] Written to PricingSourceJob for 10 Oak Park (22PG3RyGrDnQ):", {
        totalCost: written.totalCost,
        totalSell: written.totalSell,
      });
    }
  }

  const roomsData = roomsToInsert.map((r) => ({
    ...r,
    autoDetectedSqFt: normalizeNumber(r.autoDetectedSqFt),
    manualSqFtOverride: normalizeNumber(r.manualSqFtOverride),
    totalCost: normalizeNumber(r.totalCost) ?? 0,
    totalSell: normalizeNumber(r.totalSell) ?? 0,
    costPerSqFt: normalizeNumber(r.costPerSqFt),
    sellPerSqFt: normalizeNumber(r.sellPerSqFt),
  }));

  const tradesData = tradesToInsert.map((t) => ({
    ...t,
    totalCost: normalizeNumber(t.totalCost) ?? 0,
    totalSell: normalizeNumber(t.totalSell) ?? 0,
  }));

  const deleteJobFilter = jobIds?.length ? { where: { jobId: { in: jobIds } } } : undefined;

  await prisma.$transaction(
    async (tx) => {
      await tx.pricingSourceTrade.deleteMany(deleteJobFilter);
      await tx.pricingSourceRoom.deleteMany(deleteJobFilter);
      await tx.pricingSourceJob.deleteMany(deleteJobFilter);

      if (jobsData.length > 0) {
        await tx.pricingSourceJob.createMany({
          data: jobsData,
          skipDuplicates: true,
        });
      }

      if (roomsData.length > 0) {
        await tx.pricingSourceRoom.createMany({
          data: roomsData,
          skipDuplicates: true,
        });
      }

      if (tradesData.length > 0) {
        await tx.pricingSourceTrade.createMany({
          data: tradesData,
          skipDuplicates: true,
        });
      }
    },
    {
      // Keep some headroom over the default 5s, but most work is now done
      // outside the transaction.
      timeout: 15000,
    },
  );

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[JobTread pricing][staging] Rebuilt pricing staging.", {
      scope: result.scope,
      jobsCount: result.jobsCount,
      roomsCount: result.roomsCount,
      tradesCount: result.tradesCount,
      jobIds: jobIds?.length ? jobIds : undefined,
    });
  }

  return result;
}

