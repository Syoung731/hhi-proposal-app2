/**
 * Normalizes pasted/imported budget JSON into NormalizedJobBudget.
 * Accepts loose JSON (e.g. from DataX or hand-written) and coerces types,
 * fills defaults, and validates required fields. Returns readable errors.
 */

import type {
  NormalizedJobBudget,
  NormalizedBudgetGroup,
  NormalizedBudgetItem,
} from "./budget-types";

export type NormalizeBudgetJsonResult =
  | { ok: true; budget: NormalizedJobBudget }
  | { ok: false; error: string };

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normGroup(g: unknown): NormalizedBudgetGroup | null {
  if (!g || typeof g !== "object") return null;
  const o = g as Record<string, unknown>;
  const id = str(o.id);
  const name = str(o.name);
  if (!id || !name) return null;
  const parentId = o.parentId != null ? str(o.parentId) || null : null;
  return { id, name, parentId: parentId || null };
}

function normItem(it: unknown): NormalizedBudgetItem | null {
  if (!it || typeof it !== "object") return null;
  const o = it as Record<string, unknown>;
  const id = str(o.id);
  const name = str(o.name);
  if (!id || !name) return null;
  const groupId = o.groupId != null ? str(o.groupId) || null : null;
  const groupName = o.groupName != null ? str(o.groupName) || null : null;
  return {
    id,
    name,
    groupId,
    groupName: groupName ?? undefined,
    costCode: o.costCode != null ? str(o.costCode) || null : null,
    costCodeName: o.costCodeName != null ? str(o.costCodeName) || null : null,
    costType: o.costType != null ? str(o.costType) || null : null,
    unit: o.unit != null ? str(o.unit) || null : null,
    quantity: num(o.quantity) ?? undefined,
    unitCost: num(o.unitCost) ?? undefined,
    unitPrice: num(o.unitPrice) ?? undefined,
    extCost: num(o.extCost) ?? undefined,
    extSell: num(o.extSell) ?? undefined,
    description: o.description != null ? str(o.description) || null : null,
    rawLine: o.rawLine != null ? str(o.rawLine) || null : null,
  };
}

/**
 * Normalize and validate JSON into NormalizedJobBudget.
 * Expected shape: { jobId, jobName, groups?, items, jobNumber?, stage?, location?, sourceSummarySell?, sourceSummaryCost? }
 * - jobId, jobName: required strings.
 * - items: required array; each item must have id and name (strings); other fields optional (groupId, groupName, quantity, unitCost, unitPrice, extCost, extSell, costCode, costType, unit, description, etc.).
 * - groups: optional array; each group { id, name, parentId? }.
 * Does not mutate the input; returns a new object.
 */
export function normalizeBudgetJson(raw: unknown): NormalizeBudgetJsonResult {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Budget JSON must be an object." };
  }
  const obj = raw as Record<string, unknown>;

  const jobId = str(obj.jobId);
  const jobName = str(obj.jobName);
  if (!jobId) return { ok: false, error: "Budget JSON must include jobId." };
  if (!jobName) return { ok: false, error: "Budget JSON must include jobName." };

  const groupsRaw = obj.groups;
  const groups: NormalizedBudgetGroup[] = Array.isArray(groupsRaw)
    ? groupsRaw.map(normGroup).filter((g): g is NormalizedBudgetGroup => g != null)
    : [];

  const itemsRaw = obj.items;
  if (!Array.isArray(itemsRaw)) {
    return { ok: false, error: "Budget JSON must include an items array." };
  }
  const items: NormalizedBudgetItem[] = itemsRaw
    .map(normItem)
    .filter((i): i is NormalizedBudgetItem => i != null);
  if (items.length === 0) {
    return { ok: false, error: "Budget JSON must have at least one valid item (id and name required)." };
  }

  const budget: NormalizedJobBudget = {
    jobId,
    jobName,
    jobNumber: obj.jobNumber != null ? str(obj.jobNumber) || null : null,
    stage: obj.stage != null ? str(obj.stage) || null : null,
    location: obj.location != null ? str(obj.location) || null : null,
    groups,
    items,
    sourceSummarySell: num(obj.sourceSummarySell) ?? null,
    sourceSummaryCost: num(obj.sourceSummaryCost) ?? null,
  };
  return { ok: true, budget };
}
