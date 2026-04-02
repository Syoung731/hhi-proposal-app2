/**
 * JobTread catalog and template fetch functions.
 * Uses the existing Pave client (app/lib/jobtread/client.ts) with new query builders.
 * Server-only.
 */
import "server-only";

import { jobTreadRequest } from "@/app/lib/jobtread/client";
import {
  buildOrgIdQuery,
  buildOrgCostItemsPageQuery,
  buildOrgCostGroupTemplatesQuery,
  buildOrgCostGroupsPageQuery,
  buildOrgCostItemsForTreePageQuery,
} from "@/app/lib/jobtread/catalog-queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JTCostItem = {
  id: string;
  name: string;
  description?: string | null;
  unitCost?: number | null;
  unitPrice?: number | null;
  costCodeName?: string | null;
  costCodeNumber?: string | null;
  costTypeName?: string | null;
  unitName?: string | null;
  unitAbbreviation?: string | null;
};

export type JTTemplate = {
  id: string;
  name: string;
};

export type JTTemplateTradeGroup = {
  id: string;
  name: string;
  items: JTTemplateItem[];
};

export type JTTemplateItem = {
  id: string;
  name: string;
  description?: string | null;
  unitCost?: number | null;
  unitPrice?: number | null;
  costCodeName?: string | null;
  costTypeName?: string | null;
  unitAbbreviation?: string | null;
};

export type JTTemplateDetail = {
  id: string;
  name: string;
  tradeGroups: JTTemplateTradeGroup[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function safeStr(v: any): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function safeNum(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Convert JobTread unit full names to standard abbreviations. */
const UNIT_ABBREVIATIONS: Record<string, string> = {
  "Each": "EA",
  "Square Feet": "SF",
  "Linear Feet": "LF",
  "Hours": "HR",
  "Days": "DAY",
  "Gallons": "GAL",
  "Square": "SQ",
  "Per Job": "JOB",
  "Per Room": "ROOM",
};

function abbreviateUnit(unitName: string | null): string | null {
  if (!unitName) return null;
  return UNIT_ABBREVIATIONS[unitName] ?? unitName;
}

// ---------------------------------------------------------------------------
// Resolve organization ID
// ---------------------------------------------------------------------------

/**
 * Fallback org ID from the existing codebase (app/integrations/jobtread-pricing.ts).
 * Used when currentGrant.organization is null (some grant key types don't expose it).
 */
const FALLBACK_ORG_ID = "22P3uKaSn7Ca";

let _cachedOrgId: string | null = null;

async function getOrgId(): Promise<string> {
  if (_cachedOrgId) return _cachedOrgId;

  // Try to resolve dynamically via currentGrant
  try {
    const query = buildOrgIdQuery();
    const raw = (await jobTreadRequest(query, { step: "orgId" })) as any;
    const org =
      raw?.currentGrant?.organization ??
      raw?.data?.currentGrant?.organization;
    if (typeof org?.id === "string" && org.id.trim()) {
      _cachedOrgId = org.id;
      return org.id;
    }
  } catch {
    // Fall through to hardcoded ID
  }

  // Fallback: use known HHI Builders org ID
  _cachedOrgId = FALLBACK_ORG_ID;
  return FALLBACK_ORG_ID;
}

// ---------------------------------------------------------------------------
// Fetch all organization cost items (paginated)
// ---------------------------------------------------------------------------

export async function fetchCostItems(): Promise<JTCostItem[]> {
  const orgId = await getOrgId();
  const items: JTCostItem[] = [];
  let page: string | null = null;

  do {
    const query = buildOrgCostItemsPageQuery(orgId, page);
    const raw = (await jobTreadRequest(query, {
      step: "orgCostItems",
    })) as any;

    const connection =
      raw?.organization?.costItems ??
      raw?.data?.organization?.costItems;

    const nodes: any[] = connection?.nodes ?? [];
    for (const n of nodes) {
      // Filter: only standalone catalog items with proper nomenclature
      // - no job (not a job budget item)
      // - no document (not a document duplicate)
      // - no costGroup (not inside a template group)
      // - must have [XXX] trade prefix
      const jobId = n.job?.id;
      if (typeof jobId === "string" && jobId.trim()) continue;
      const docId = n.document?.id;
      if (typeof docId === "string" && docId.trim()) continue;
      const cgId = n.costGroup?.id;
      if (typeof cgId === "string" && cgId.trim()) continue;
      const itemName = n.name ?? "";
      if (!/^\[[A-Z]+\]/.test(itemName)) continue;

      items.push({
        id: n.id,
        name: n.name ?? "",
        description: safeStr(n.description),
        unitCost: safeNum(n.unitCost),
        unitPrice: safeNum(n.unitPrice),
        costCodeName: safeStr(n.costCode?.name),
        costCodeNumber: safeStr(n.costCode?.number),
        costTypeName: safeStr(n.costType?.name),
        unitName: safeStr(n.unit?.name),
        unitAbbreviation: abbreviateUnit(safeStr(n.unit?.name)),
      });
    }

    page = connection?.nextPage ?? null;
  } while (page != null);

  return items;
}

// ---------------------------------------------------------------------------
// Fetch organization cost group templates (paginated)
// ---------------------------------------------------------------------------

export async function fetchCostGroupTemplates(): Promise<JTTemplate[]> {
  const orgId = await getOrgId();
  const templates: JTTemplate[] = [];
  let page: string | null = null;

  do {
    const query = buildOrgCostGroupTemplatesQuery(orgId, page);
    const raw = (await jobTreadRequest(query, {
      step: "orgCostGroupTemplates",
    })) as any;

    const connection =
      raw?.organization?.costGroups ??
      raw?.data?.organization?.costGroups;

    const nodes: any[] = connection?.nodes ?? [];
    for (const n of nodes) {
      // Filter: only top-level org templates (no parent cost group AND no job)
      const parentId = n.parentCostGroup?.id;
      if (typeof parentId === "string" && parentId.trim()) continue;
      const jobId = n.job?.id;
      if (typeof jobId === "string" && jobId.trim()) continue;

      templates.push({ id: n.id, name: n.name ?? "" });
    }

    page = connection?.nextPage ?? null;
  } while (page != null);

  return templates;
}

// ---------------------------------------------------------------------------
// Fetch full details for one template (bulk fetch + tree assembly)
// ---------------------------------------------------------------------------

// Raw group/item types for tree assembly
type RawGroup = { id: string; name: string; parentId: string | null };
type RawItem = {
  id: string;
  name: string;
  description: string | null;
  unitCost: number | null;
  unitPrice: number | null;
  costCodeName: string | null;
  costTypeName: string | null;
  unitAbbreviation: string | null;
  costGroupId: string | null;
};

// Cached org-level groups and items (fetched once per process lifetime)
let _cachedOrgGroups: RawGroup[] | null = null;
let _cachedOrgItems: RawItem[] | null = null;

async function getOrgGroupsAndItems(): Promise<{
  groups: RawGroup[];
  items: RawItem[];
}> {
  if (_cachedOrgGroups && _cachedOrgItems) {
    return { groups: _cachedOrgGroups, items: _cachedOrgItems };
  }

  const orgId = await getOrgId();

  // Fetch all org cost groups (paginated) — mirrors budget-source.ts pattern
  const groups: RawGroup[] = [];
  let groupsPage: string | null = null;
  for (;;) {
    const raw = (await jobTreadRequest(
      buildOrgCostGroupsPageQuery(orgId, groupsPage),
      { step: "orgGroupsPage" }
    )) as any;
    const conn =
      raw?.organization?.costGroups ?? raw?.data?.organization?.costGroups;
    const nodes: any[] = conn?.nodes ?? [];
    for (const n of nodes) {
      // Only org-level groups (no job association)
      const jobId = n.job?.id;
      if (typeof jobId === "string" && jobId.trim()) continue;
      const parentId = n.parentCostGroup?.id;
      groups.push({
        id: n.id,
        name: n.name ?? "",
        parentId: typeof parentId === "string" && parentId.trim() ? parentId : null,
      });
    }
    groupsPage = conn?.nextPage ?? null;
    if (groupsPage == null) break;
  }

  // Fetch all org cost items (paginated) — mirrors budget-source.ts pattern
  const items: RawItem[] = [];
  let itemsPage: string | null = null;
  for (;;) {
    const raw = (await jobTreadRequest(
      buildOrgCostItemsForTreePageQuery(orgId, itemsPage),
      { step: "orgItemsTreePage" }
    )) as any;
    const conn =
      raw?.organization?.costItems ?? raw?.data?.organization?.costItems;
    const nodes: any[] = conn?.nodes ?? [];
    for (const n of nodes) {
      // Only org-level items (no job, no document)
      const jobId = n.job?.id;
      if (typeof jobId === "string" && jobId.trim()) continue;
      const docId = n.document?.id;
      if (typeof docId === "string" && docId.trim()) continue;

      const cgId = n.costGroup?.id;
      items.push({
        id: n.id,
        name: n.name ?? "",
        description: safeStr(n.description),
        unitCost: safeNum(n.unitCost),
        unitPrice: safeNum(n.unitPrice),
        costCodeName: safeStr(n.costCode?.name),
        costTypeName: safeStr(n.costType?.name),
        unitAbbreviation: abbreviateUnit(safeStr(n.unit?.name)),
        costGroupId: typeof cgId === "string" && cgId.trim() ? cgId : null,
      });
    }
    itemsPage = conn?.nextPage ?? null;
    if (itemsPage == null) break;
  }

  _cachedOrgGroups = groups;
  _cachedOrgItems = items;
  return { groups, items };
}

/** Collect all descendant group IDs for a given parent (recursive). */
function collectDescendantIds(
  parentId: string,
  childrenMap: Map<string, RawGroup[]>
): Set<string> {
  const result = new Set<string>();
  const queue = [parentId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    const children = childrenMap.get(current) ?? [];
    for (const child of children) {
      if (!result.has(child.id)) {
        result.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return result;
}

export async function fetchCostGroupTemplateDetails(
  templateId: string
): Promise<JTTemplateDetail> {
  const { groups, items } = await getOrgGroupsAndItems();

  // Find the template group itself
  const templateGroup = groups.find((g) => g.id === templateId);
  if (!templateGroup) {
    throw new Error(`Template ${templateId} not found in org cost groups.`);
  }

  // Build parent→children map
  const childrenMap = new Map<string, RawGroup[]>();
  for (const g of groups) {
    if (g.parentId) {
      const siblings = childrenMap.get(g.parentId) ?? [];
      siblings.push(g);
      childrenMap.set(g.parentId, siblings);
    }
  }

  // All descendant group IDs under this template
  const descendantIds = collectDescendantIds(templateId, childrenMap);

  // Direct children of the template
  let directChildren = childrenMap.get(templateId) ?? [];

  // Handle room wrapper pattern: if there's exactly 1 direct child that itself
  // has children, it's a room wrapper (e.g., "Powder Room" inside template "Powder Room").
  // Descend to its children to get the actual trade groups.
  if (directChildren.length === 1) {
    const wrapper = directChildren[0];
    const wrapperChildren = childrenMap.get(wrapper.id) ?? [];
    if (wrapperChildren.length > 0) {
      directChildren = wrapperChildren;
    }
  }

  // Build trade groups with flattened items
  const tradeGroups: JTTemplateTradeGroup[] = [];

  for (const tradeGroup of directChildren) {
    // Collect all group IDs under this trade (including the trade group itself
    // and any Material/Labor leaf groups beneath it)
    const tradeDescendants = collectDescendantIds(tradeGroup.id, childrenMap);
    const tradeGroupIds = new Set([tradeGroup.id, ...tradeDescendants]);

    // Collect all items belonging to this trade group or any of its descendants
    const tradeItems: JTTemplateItem[] = items
      .filter((item) => item.costGroupId != null && tradeGroupIds.has(item.costGroupId))
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        unitCost: item.unitCost,
        unitPrice: item.unitPrice,
        costCodeName: item.costCodeName,
        costTypeName: item.costTypeName,
        unitAbbreviation: item.unitAbbreviation,
      }));

    tradeGroups.push({
      id: tradeGroup.id,
      name: tradeGroup.name,
      items: tradeItems,
    });
  }

  return {
    id: templateGroup.id,
    name: templateGroup.name,
    tradeGroups,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Trade prefix parser
// ---------------------------------------------------------------------------

const TRADE_PREFIX_MAP: Record<string, string> = {
  ADM: "Admin/Overhead",
  APP: "Appliances",
  CAB: "Cabinets/Countertops",
  CON: "Concrete",
  DEC: "Decking",
  DMO: "Demolition",
  DOR: "Doors",
  DRY: "Drywall",
  ELE: "Electrical",
  FLR: "Flooring",
  FND: "Foundation",
  FRM: "Framing",
  GLA: "Glass",
  HRD: "Bath Hardware",
  HVAC: "HVAC",
  INS: "Insulation",
  MSC: "Miscellaneous",
  PEST: "Pest Control",
  PLM: "Plumbing",
  PNT: "Paint",
  ROF: "Roofing",
  SID: "Siding",
  TIL: "Tile",
  TRM: "Trim",
  WIN: "Windows",
};

/**
 * Extract trade name from item name prefix like "[CAB] Cabinet Base Unit - Material".
 * Returns the full trade name or null if no bracket prefix.
 */
export function parseTradePrefix(itemName: string): string | null {
  const match = itemName.match(/^\[([A-Z]+)\]/);
  if (!match) return null;
  return TRADE_PREFIX_MAP[match[1]] ?? null;
}

// ---------------------------------------------------------------------------
// Template display name cleaner
// ---------------------------------------------------------------------------

/**
 * Clean template name to a user-friendly display name:
 * - Strip leading backtick + letter + period + space: "`E. Kitchen" → "Kitchen"
 * - Strip "Updated - " prefix and date suffix: "Updated - Kitchen 3/5/2026" → "Kitchen"
 * - Strip "Standardized - " prefix
 */
export function cleanDisplayName(templateName: string): string {
  let name = templateName.trim();
  // Strip backtick + letter + period prefix: "`E. Kitchen" → "Kitchen"
  name = name.replace(/^`?[A-Za-z]\.\s*/, "");
  // Strip "Updated - " prefix
  name = name.replace(/^Updated\s*-\s*/i, "");
  // Strip "Standardized - " prefix
  name = name.replace(/^Standardized\s*-\s*/i, "");
  // Strip trailing date like " 3/5/2026" or " 12/31/2025"
  name = name.replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}$/, "");
  return name.trim();
}
