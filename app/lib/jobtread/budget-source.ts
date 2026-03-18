/**
 * Budget source seam: single entry point for obtaining a NormalizedJobBudget per job.
 *
 * Design:
 * - Source acquisition (fetch from API / DataX / file) is separate from normalization.
 * - This module does NOT use raw job.costGroups / job.costItems; those are the wrong
 *   shape for budget-screen totals. Use a budget-projection source (e.g. DataX
 *   jobtread_get_job_budget) when wired.
 *
 * When no real source is wired, returns null so callers can skip syncing and log.
 */

import type { NormalizedJobBudget } from "./budget-types";
import { jobTreadRequest } from "./client";
import {
  buildJobCostGroupsPageQuery,
  buildJobCostItemsPageQuery,
} from "./queries";
import { normalizeRawJobBudget } from "./budget-adapter";

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function fetchDirectJobTreadBudget(
  jobId: string,
  jobName?: string,
  jobNumber?: string | null
): Promise<NormalizedJobBudget | null> {
  // 1) Synthetic job node using known context from caller (id, name, number).
  const jobNode: unknown = {
    id: jobId,
    name: jobName ?? jobId,
    number: jobNumber ?? null,
    customFieldValues: { nodes: [] as unknown[] },
  };

  // 2) All cost groups (preserve true parent/child hierarchy)
  const groupsRaw: unknown[] = [];
  let groupsPage: string | null = null;
  for (;;) {
    const groupsJson = await jobTreadRequest(
      buildJobCostGroupsPageQuery(jobId, groupsPage),
      { step: "costGroupsPage" }
    );
    const root = groupsJson as {
      data?: { job?: { costGroups?: { nodes?: unknown[]; nextPage?: string | null } } };
      job?: { costGroups?: { nodes?: unknown[]; nextPage?: string | null } };
    };
    const job = root.data?.job ?? root.job;
    const conn = job?.costGroups;
    const nodes = (conn?.nodes ?? []) as unknown[];
    groupsRaw.push(...nodes);
    groupsPage = conn?.nextPage ?? null;
    if (groupsPage == null) break;
  }

  // 3) All cost items, then filter to documentId == null (documentId-null-only)
  const itemsRawAll: unknown[] = [];
  let itemsPage: string | null = null;
  for (;;) {
    const itemsJson = await jobTreadRequest(
      buildJobCostItemsPageQuery(jobId, itemsPage),
      { step: "costItemsPage" }
    );
    const root = itemsJson as {
      data?: { job?: { costItems?: { nodes?: unknown[]; nextPage?: string | null } } };
      job?: { costItems?: { nodes?: unknown[]; nextPage?: string | null } };
    };
    const job = root.data?.job ?? root.job;
    const conn = job?.costItems;
    const nodes = (conn?.nodes ?? []) as unknown[];
    itemsRawAll.push(...nodes);
    itemsPage = conn?.nextPage ?? null;
    if (itemsPage == null) break;
  }

  const itemsRawFiltered: unknown[] = [];
  let rawItemCount = 0;
  for (const it of itemsRawAll) {
    if (!it || typeof it !== "object") continue;
    rawItemCount += 1;
    const row = it as Record<string, unknown>;
    const doc = row.document as { id?: unknown } | undefined;
    const documentId =
      typeof doc?.id === "string" && doc.id.trim() ? doc.id.trim() : null;
    if (documentId == null) {
      itemsRawFiltered.push(row);
    }
  }

  const filteredItemCount = itemsRawFiltered.length;
  const topLevelGroupCount = groupsRaw.filter((g) => {
    if (!g || typeof g !== "object") return false;
    const row = g as Record<string, unknown>;
    const parent = row.parentCostGroup as { id?: unknown } | undefined;
    const parentId =
      typeof parent?.id === "string" && parent.id.trim() ? parent.id.trim() : null;
    return parentId == null;
  }).length;

  // 4) Totals from filtered items: quantity * unitCost / quantity * unitPrice
  let totalSell = 0;
  let totalCost = 0;
  for (const it of itemsRawFiltered) {
    const row = it as Record<string, unknown>;
    const qty = toNumber(row.quantity);
    const unitCost = toNumber(row.unitCost);
    const unitPrice = toNumber(row.unitPrice);
    const extCost = qty * unitCost;
    const extSell = qty * unitPrice;
    totalCost += extCost;
    totalSell += extSell;
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[JobTread budget-source][direct JT]", {
      jobId,
      jobName: jobName ?? null,
      jobNumber: jobNumber ?? null,
      rawItemCount,
      filteredItemCount,
      rawParentNullGroupCount: topLevelGroupCount,
      totalSell,
      totalCost,
    });
  }

  // 5) Normalize into NormalizedJobBudget using the standard adapter
  return normalizeRawJobBudget({
    jobNode,
    groupsRaw,
    itemsRaw: itemsRawFiltered,
    sourceTotalPrice: null,
    sourceTotalCost: null,
  });
}

/**
 * Returns a normalized job budget for the given job, or null if no budget is
 * available (e.g. source not wired, job not found, or fetch failed).
 *
 * Source acquisition and normalization are separated: implementors should
 * 1) acquire budget data from the chosen source (DataX, JobTread budget API, etc.),
 * 2) normalize that payload into NormalizedJobBudget in a dedicated adapter.
 */
export async function getNormalizedJobBudget(
  jobId: string,
  jobName?: string,
  jobNumber?: string | null
): Promise<NormalizedJobBudget | null> {
  try {
    const budget = await fetchDirectJobTreadBudget(jobId, jobName, jobNumber ?? null);
    return budget;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error(
        "[JobTread budget-source] Failed to fetch direct JobTread budget for jobId=%s: %s",
        jobId,
        e instanceof Error ? e.message : String(e)
      );
    }
    return null;
  }
}
