/**
 * Server-only adapter: raw JobTread budget response(s) -> NormalizedJobBudget.
 * All raw API shape assumptions live here. The primary budget source path is now the
 * formatted text export parsed in budget-text-parser.ts; this adapter remains for
 * any alternative/legacy raw API path.
 */
import type {
  NormalizedJobBudget,
  NormalizedBudgetGroup,
  NormalizedBudgetItem,
} from "./budget-types";

/** Safe number from raw value (string or number). */
function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Safe string, trimmed. */
function toString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Extract job stage (and optionally location) from customFieldValues nodes. */
function parseJobCustomFields(jobNode: Record<string, unknown>): {
  stage: string | null;
  location: string | null;
} {
  let stage: string | null = null;
  let location: string | null = null;
  const cfv = jobNode.customFieldValues as { nodes?: unknown[] } | undefined;
  const nodes = cfv?.nodes;
  if (!Array.isArray(nodes)) return { stage, location };
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const row = node as Record<string, unknown>;
    const cf = row.customField as { name?: unknown } | undefined;
    const name = typeof cf?.name === "string" ? cf.name.trim() : "";
    const value = row.value;
    const valueStr = typeof value === "string" ? value.trim() : "";
    if (!valueStr) continue;
    if (name.toLowerCase() === "job stage") stage = valueStr;
    if (name.toLowerCase() === "location") location = valueStr;
  }
  return { stage, location };
}

/**
 * Normalize a single raw cost group to NormalizedBudgetGroup.
 * Assumption: raw has id, name, and optionally parentCostGroup.id.
 */
function normalizeGroup(g: unknown): NormalizedBudgetGroup | null {
  if (!g || typeof g !== "object") return null;
  const row = g as Record<string, unknown>;
  const id = toString(row.id);
  const name = toString(row.name);
  if (!id || !name) return null;
  const parent = row.parentCostGroup as { id?: unknown } | undefined;
  const parentId =
    typeof parent?.id === "string" && parent.id.trim()
      ? parent.id.trim()
      : null;
  return { id, name, parentId };
}

/**
 * Normalize a single raw cost item to NormalizedBudgetItem.
 * Assumptions:
 * - id, name, quantity, unitPrice, unitCost, costGroup: { id, name }
 * - Optional: unit: { id, name }, code, costCode: { id, name, number }, costType: { id, name }, extendedCost, extendedPrice
 * - extendedCost/extendedPrice are used when present; otherwise we rely on sync-budget to compute from quantity * unitCost/unitPrice.
 */
function normalizeItem(
  item: unknown,
  groupNameById: Map<string, string>
): NormalizedBudgetItem | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const id = toString(row.id);
  const name = toString(row.name);
  if (!id || !name) return null;

  const costGroup = row.costGroup as { id?: unknown; name?: unknown } | undefined;
  const groupId =
    typeof costGroup?.id === "string" && costGroup.id.trim()
      ? costGroup.id.trim()
      : null;
  const groupName =
    typeof costGroup?.name === "string" && costGroup.name.trim()
      ? costGroup.name.trim()
      : groupId
        ? groupNameById.get(groupId) ?? null
        : null;

  const unitObj = row.unit as { id?: unknown; name?: unknown } | undefined;
  const unit =
    typeof unitObj?.name === "string"
      ? unitObj.name.trim()
      : typeof unitObj?.id === "string"
        ? unitObj.id.trim()
        : null;

  const costCodeObj = row.costCode as
    | { id?: unknown; name?: unknown; number?: unknown }
    | undefined;
  const costCode =
    typeof costCodeObj?.number === "string"
      ? costCodeObj.number.trim()
      : typeof costCodeObj?.id === "string"
        ? costCodeObj.id.trim()
        : typeof row.code === "string"
          ? row.code.trim()
          : null;
  const costCodeName =
    typeof costCodeObj?.name === "string" ? costCodeObj.name.trim() : null;

  const costTypeObj = row.costType as { id?: unknown; name?: unknown } | undefined;
  const costType =
    typeof costTypeObj?.name === "string"
      ? costTypeObj.name.trim()
      : typeof costTypeObj?.id === "string"
        ? costTypeObj.id.trim()
        : null;

  const quantity = toNumber(row.quantity);
  const unitCost = toNumber(row.unitCost);
  const unitPrice = toNumber(row.unitPrice);
  const extendedCost =
    row.extendedCost != null ? toNumber(row.extendedCost) : null;
  const extendedPrice =
    row.extendedPrice != null ? toNumber(row.extendedPrice) : null;

  return {
    id,
    name,
    groupId,
    groupName: groupName ?? undefined,
    costCode: costCode || null,
    costCodeName: costCodeName || null,
    costType: costType || null,
    unit: unit || null,
    quantity: quantity || null,
    unitCost: unitCost || null,
    unitPrice: unitPrice || null,
    extCost:
      extendedCost != null && Number.isFinite(extendedCost) ? extendedCost : null,
    extSell:
      extendedPrice != null && Number.isFinite(extendedPrice)
        ? extendedPrice
        : null,
  };
}

export type RawJobBudgetInput = {
  /** Single job node from job meta query (id, name, number, customFieldValues). */
  jobNode: unknown;
  /** All raw cost group objects (from paginated costGroups.nodes). */
  groupsRaw: unknown[];
  /** All raw cost item objects (from paginated costItems.nodes). */
  itemsRaw: unknown[];
  /** Optional: if API returns job-level totalPrice/totalCost, pass here for source summary comparison. */
  sourceTotalPrice?: number | null;
  sourceTotalCost?: number | null;
};

/**
 * Normalize raw JobTread budget into NormalizedJobBudget.
 * Throws if job node is missing or has no id/name.
 */
export function normalizeRawJobBudget(input: RawJobBudgetInput): NormalizedJobBudget {
  const { jobNode, groupsRaw, itemsRaw, sourceTotalPrice, sourceTotalCost } = input;
  if (!jobNode || typeof jobNode !== "object") {
    throw new Error("JobTread budget: missing job node.");
  }
  const job = jobNode as Record<string, unknown>;
  const jobId = toString(job.id);
  const jobName = toString(job.name);
  if (!jobId || !jobName) {
    throw new Error("JobTread budget: job id and name are required.");
  }
  const jobNumber =
    typeof job.number === "string" && job.number.trim()
      ? job.number.trim()
      : null;
  const { stage, location } = parseJobCustomFields(job);

  const groups: NormalizedBudgetGroup[] = [];
  for (const g of groupsRaw) {
    const norm = normalizeGroup(g);
    if (norm) groups.push(norm);
  }
  const groupNameById = new Map(groups.map((x) => [x.id, x.name]));

  const items: NormalizedBudgetItem[] = [];
  for (const it of itemsRaw) {
    const norm = normalizeItem(it, groupNameById);
    if (norm) items.push(norm);
  }

  return {
    jobId,
    jobName,
    jobNumber,
    stage,
    location,
    groups,
    items,
    sourceSummarySell: sourceTotalPrice ?? null,
    sourceSummaryCost: sourceTotalCost ?? null,
  };
}
