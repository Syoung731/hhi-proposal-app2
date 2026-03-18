/**
 * Server-only types for JobTread normalized budget payload (DataX-style).
 * Used by sync-budget to flatten groups/items into canonical rows.
 */

/** Normalized cost group from JobTread (id, name, optional parent). */
export type NormalizedBudgetGroup = {
  id: string;
  name: string;
  parentId?: string | null;
};

/** Normalized cost item: one line in the budget. */
export type NormalizedBudgetItem = {
  id: string;
  name: string;
  groupId: string | null;
  groupName?: string | null;
  costCode?: string | null;
  costCodeName?: string | null;
  costType?: string | null;
  unit?: string | null;
  quantity?: number | null;
  unitCost?: number | null;
  unitPrice?: number | null;
  /** Extended cost from source; use when present, else quantity * unitCost. */
  extCost?: number | null;
  /** Extended sell from source; use when present, else quantity * unitPrice. */
  extSell?: number | null;
  /** Optional description (e.g. from DataX-style desc field). */
  description?: string | null;
  /** Optional raw line for debugging (parser path). */
  rawLine?: string | null;
};

/** Normalized job budget: job metadata + groups + items. */
export type NormalizedJobBudget = {
  jobId: string;
  jobName: string;
  jobNumber?: string | null;
  stage?: string | null;
  location?: string | null;
  groups: NormalizedBudgetGroup[];
  items: NormalizedBudgetItem[];
  /** Optional summary from source (for comparison only). */
  sourceSummarySell?: number | null;
  sourceSummaryCost?: number | null;
};

/** One canonical row input for SyncedBudgetRow (before DB write). */
export type CanonicalBudgetRowInput = {
  jobId: string;
  jobName: string;
  externalBudgetItemId: string;
  groupName: string | null; // cost group name
  costGroupId: string | null;
  parentCostGroupId: string | null;
  parentCostGroupName: string | null;
  itemName: string;
  costCode: string | null;
  costCodeName: string | null;
  costType: string | null;
  unit: string | null;
  quantity: number | null;
  unitCost: number | null;
  unitPrice: number | null;
  extCost: number;
  extSell: number;
  rawPayloadJson: Record<string, unknown>;
};
