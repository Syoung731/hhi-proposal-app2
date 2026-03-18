/**
 * Shared normalization helpers for JobTread pricing:
 * - Parse group names into room / trade
 * - Build stable room keys
 * - Shared sq ft heuristics
 *
 * Both the pricing import/sync layer and the pricing-staging rebuild should use
 * these helpers so that the same raw data yields the same Job → Room → Trade
 * structure.
 */

export type RoomTradeNormalizationInput = {
  sourceJobId: string;
  sourceGroupId: string | null;
  sourceItemId: string | null;
  groupName: string | null;
  itemName: string;
};

export type RoomTradeNormalizationResult = {
  sourceJobId: string;
  sourceGroupId: string | null;
  sourceItemId: string | null;
  roomName: string | null;
  roomKey: string | null;
  tradeName: string | null;
  classificationConfidence: "high" | "medium" | "low";
  parseWarnings: string[];
  isUnmapped: boolean;
};

/**
 * Core string normalization: split a group name like
 *   "Living Room > Electrical"
 * into { roomName: "Living Room", tradeName: "Electrical" }.
 *
 * When no usable segments exist we fall back to "Ungrouped" and mark
 * classificationConfidence as "low".
 */
export function deriveRoomAndTradeFromGroupName(
  input: RoomTradeNormalizationInput,
): RoomTradeNormalizationResult {
  const warnings: string[] = [];
  const fallbackRoom = "Ungrouped";

  const raw = input.groupName;
  const norm =
    typeof raw === "string" ? raw.split(">").map((s) => s.trim()).filter(Boolean) : [];

  let roomName: string | null = null;
  let tradeName: string | null = null;
  let confidence: RoomTradeNormalizationResult["classificationConfidence"] = "high";

  if (!raw || norm.length === 0) {
    roomName = fallbackRoom;
    tradeName = null;
    confidence = "low";
    warnings.push("group-name-missing");
  } else if (norm.length === 1) {
    roomName = norm[0]!;
    tradeName = null;
    confidence = "medium";
    warnings.push("trade-name-missing");
  } else {
    roomName = norm[0]!;
    tradeName = norm[1] || null;
    if (!tradeName) {
      confidence = "medium";
      warnings.push("trade-name-empty");
    }
  }

  const trimmedRoom = roomName?.trim() || "";
  const isUnmapped = trimmedRoom.length === 0;
  const roomKey = !isUnmapped ? `${input.sourceJobId}::${trimmedRoom}` : null;

  return {
    sourceJobId: input.sourceJobId,
    sourceGroupId: input.sourceGroupId,
    sourceItemId: input.sourceItemId,
    roomName: !isUnmapped ? trimmedRoom : null,
    roomKey,
    tradeName: tradeName?.trim() || null,
    classificationConfidence: confidence,
    parseWarnings: warnings,
    isUnmapped,
  };
}

export type SqFtDetection = {
  sqFt: number | null;
  source: "flooring_install" | "final_cleaning" | null;
};

/**
 * Shared heuristic for detecting sq ft from flooring install rows.
 * Accepts any row shape that exposes { itemName, quantity }.
 */
export function detectFlooringSqFt<
  T extends { itemName: string; quantity: number | null | undefined },
>(rows: T[]): SqFtDetection {
  for (const row of rows) {
    const name = row.itemName.toLowerCase();
    if (!name.includes("install") && !name.includes("installation")) continue;
    if (
      !(
        name.includes("floor") ||
        name.includes("flooring") ||
        name.includes("tile") ||
        name.includes("lvp") ||
        name.includes("vinyl") ||
        name.includes("plank") ||
        name.includes("laminate") ||
        name.includes("hardwood") ||
        name.includes("carpet")
      )
    ) {
      continue;
    }
    const qty = row.quantity ?? 0;
    if (qty > 0 && Number.isFinite(qty)) {
      return { sqFt: qty, source: "flooring_install" };
    }
  }
  return { sqFt: null, source: null };
}

/**
 * Shared heuristic for detecting sq ft from COPE / final cleaning rows.
 */
export function detectCopeSqFt<
  T extends { itemName: string; quantity: number | null | undefined },
>(rows: T[]): SqFtDetection {
  for (const row of rows) {
    const name = row.itemName.toLowerCase();
    if (!name.includes("final cleaning")) continue;
    const qty = row.quantity ?? 0;
    if (qty > 0 && Number.isFinite(qty)) {
      return { sqFt: qty, source: "final_cleaning" };
    }
  }
  return { sqFt: null, source: null };
}

// ---------------------------------------------------------------------------
// Normalization stats collection
// ---------------------------------------------------------------------------

/**
 * Aggregate stats for how well normalization is working.
 *
 * - lowConfidence: group names we couldn't confidently split into room/trade
 * - unmapped: results where we could not derive a usable roomName
 * - ungrouped: results that fell back into the "Ungrouped" bucket
 */
export type NormalizationStats = {
  totalRowsProcessed: number;
  totalGroupsProcessed: number;
  totalItemsProcessed: number;
  unmappedCount: number;
  lowConfidenceCount: number;
  mediumConfidenceCount: number;
  highConfidenceCount: number;
  warningCounts: Record<string, number>;
  ungroupedCount: number;
  rowsMissingTradeCount: number;
  topRawGroupNamesWithWarnings: {
    groupName: string;
    count: number;
    warnings: string[];
  }[];
  topJobsWithWarnings: {
    jobId: string;
    count: number;
    warnings: string[];
  }[];
};

type InternalGroupWarningInfo = {
  count: number;
  warnings: Set<string>;
};

type InternalJobWarningInfo = {
  count: number;
  warnings: Set<string>;
};

type NormalizationStatsInternal = NormalizationStats & {
  _groupWarningMap: Map<string, InternalGroupWarningInfo>;
  _jobWarningMap: Map<string, InternalJobWarningInfo>;
};

export function createNormalizationStatsCollector(): NormalizationStatsInternal {
  return {
    totalRowsProcessed: 0,
    totalGroupsProcessed: 0,
    totalItemsProcessed: 0,
    unmappedCount: 0,
    lowConfidenceCount: 0,
    mediumConfidenceCount: 0,
    highConfidenceCount: 0,
    warningCounts: {},
    ungroupedCount: 0,
    rowsMissingTradeCount: 0,
    topRawGroupNamesWithWarnings: [],
    topJobsWithWarnings: [],
    _groupWarningMap: new Map(),
    _jobWarningMap: new Map(),
  };
}

type RecordNormalizationParams = {
  stats: NormalizationStatsInternal;
  jobId: string;
  rawGroupName: string | null;
  kind: "item" | "group";
  result: RoomTradeNormalizationResult;
};

export function recordNormalizationResult(params: RecordNormalizationParams) {
  const { stats, jobId, rawGroupName, kind, result } = params;
  stats.totalRowsProcessed += 1;
  if (kind === "item") stats.totalItemsProcessed += 1;
  if (kind === "group") stats.totalGroupsProcessed += 1;

  if (result.isUnmapped) {
    stats.unmappedCount += 1;
  }

  const roomName = result.roomName ?? "";
  if (!roomName || roomName === "Ungrouped") {
    stats.ungroupedCount += 1;
  }

  if (!result.tradeName) {
    stats.rowsMissingTradeCount += 1;
  }

  if (result.classificationConfidence === "low") stats.lowConfidenceCount += 1;
  if (result.classificationConfidence === "medium")
    stats.mediumConfidenceCount += 1;
  if (result.classificationConfidence === "high")
    stats.highConfidenceCount += 1;

  const groupKey = (rawGroupName ?? "(none)").trim() || "(none)";
  const jobKey = jobId;

  for (const w of result.parseWarnings) {
    stats.warningCounts[w] = (stats.warningCounts[w] ?? 0) + 1;

    const g = stats._groupWarningMap.get(groupKey) ?? {
      count: 0,
      warnings: new Set<string>(),
    };
    g.count += 1;
    g.warnings.add(w);
    stats._groupWarningMap.set(groupKey, g);

    const j = stats._jobWarningMap.get(jobKey) ?? {
      count: 0,
      warnings: new Set<string>(),
    };
    j.count += 1;
    j.warnings.add(w);
    stats._jobWarningMap.set(jobKey, j);
  }
}

type FinalizeContext = {
  phase: "sync" | "staging";
  jobIds: string[];
  totalGroupsProcessed?: number;
  totalItemsProcessed?: number;
};

export function finalizeNormalizationStats(
  stats: NormalizationStatsInternal,
  context: FinalizeContext,
): NormalizationStats {
  if (context.totalGroupsProcessed != null) {
    stats.totalGroupsProcessed = context.totalGroupsProcessed;
  }
  if (context.totalItemsProcessed != null) {
    stats.totalItemsProcessed = context.totalItemsProcessed;
  }

  const topGroups = Array.from(stats._groupWarningMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([groupName, info]) => ({
      groupName,
      count: info.count,
      warnings: Array.from(info.warnings),
    }));

  const topJobs = Array.from(stats._jobWarningMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([jobId, info]) => ({
      jobId,
      count: info.count,
      warnings: Array.from(info.warnings),
    }));

  const publicStats: NormalizationStats = {
    totalRowsProcessed: stats.totalRowsProcessed,
    totalGroupsProcessed: stats.totalGroupsProcessed,
    totalItemsProcessed: stats.totalItemsProcessed,
    unmappedCount: stats.unmappedCount,
    lowConfidenceCount: stats.lowConfidenceCount,
    mediumConfidenceCount: stats.mediumConfidenceCount,
    highConfidenceCount: stats.highConfidenceCount,
    warningCounts: stats.warningCounts,
    ungroupedCount: stats.ungroupedCount,
    rowsMissingTradeCount: stats.rowsMissingTradeCount,
    topRawGroupNamesWithWarnings: topGroups,
    topJobsWithWarnings: topJobs,
  };

  if (process.env.NODE_ENV !== "production") {
    // Plain-English summary so devs can quickly see mapping quality.
    // - Low confidence rows are ones where we could not confidently
    //   split the group name into room + trade.
    // - Unmapped rows are ones where we could not derive any usable
    //   room name at all.
    // - Ungrouped rows are ones that fell into the generic "Ungrouped"
    //   bucket, which can become a dumping ground if patterns are weak.
    // This report exists so we can improve parsing rules before we
    // change business logic or expose more mapping details in the UI.
    // eslint-disable-next-line no-console
    console.log("[JobTread normalization][%s] summary", context.phase, {
      jobCount: context.jobIds.length,
      jobSample: context.jobIds.slice(0, 5),
      totals: {
        rows: publicStats.totalRowsProcessed,
        groups: publicStats.totalGroupsProcessed,
        items: publicStats.totalItemsProcessed,
      },
      confidence: {
        high: publicStats.highConfidenceCount,
        medium: publicStats.mediumConfidenceCount,
        low: publicStats.lowConfidenceCount,
      },
      unmapped: publicStats.unmappedCount,
      ungrouped: publicStats.ungroupedCount,
      rowsMissingTrade: publicStats.rowsMissingTradeCount,
      warningCounts: publicStats.warningCounts,
      topRawGroupNamesWithWarnings: publicStats.topRawGroupNamesWithWarnings,
      topJobsWithWarnings: publicStats.topJobsWithWarnings,
    });
  }

  return publicStats;
}


