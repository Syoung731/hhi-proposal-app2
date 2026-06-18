/**
 * Template-overlay merge for the JobTread budget push.
 *
 * Builds the pure, in-memory {@link JobTreadBudgetTree} for a project by, for
 * every non-skipped room:
 *
 *   1. SCAFFOLD — emit the room's `RoomTemplate` in full: every
 *      `RoomTemplateTradeGroup` → `JTTradeGroup`, every `RoomTemplateItem` →
 *      `JTCostItem` at quantity 0 / $0 (`lineSource: "TEMPLATE_SCAFFOLD"`), so
 *      JobTread shows the complete estimator checklist even for trades the
 *      estimate didn't price.
 *   2. OVERLAY — match each `EstimateLineItem` onto a scaffold item by
 *      `catalogItemId` → `jobtreadItemId` (via the catalog item) → normalized
 *      name within the same trade group; on match, fill in
 *      quantity/unitCost/unitPrice, flip `lineSource` to `"ESTIMATE"`, record
 *      `estimateLineItemId`, and set `allowanceType` when the estimate line's
 *      `source === "ALLOWANCE"`.
 *   3. EXTRAS — estimate lines with no scaffold match append as
 *      `lineSource: "EXTRA"` under their trade group (creating the trade group
 *      if the template didn't have it).
 *
 * This module is PURE and deterministic: it issues NO JobTread calls. Cost-code
 * / cost-type ids are resolved later by the `CostCodeResolver` in the Pave
 * payload builders. Here we carry only the human-readable names
 * (`costCodeName` / `costTypeName`) from the template item, leaving the `*Id`
 * fields null.
 *
 * Room → `JTRoomGroup` uses `Room.name` (NOT the template name). Rooms with no
 * `RoomTemplate` get `hasTemplate: false` and an estimate-only build (no
 * scaffold), and are recorded in `roomsWithoutTemplate`. Rooms with no
 * `AIEstimate` (or an estimate with zero line items) are EXCLUDED from `rooms[]`
 * and recorded in `roomsWithoutEstimate` — mirroring `assembleProjectBudget()`.
 * COPE rooms (`isProjectOverhead`) are handled like any other room and ordered
 * last.
 */

import "server-only";

import { prisma } from "@/app/lib/prisma";

import type {
  CostTypeHint,
  JobTreadBudgetTree,
  JTCostItem,
  JTLineSource,
  JTRoomGroup,
  JTTradeGroup,
} from "./types";

// ---------------------------------------------------------------------------
// Prisma query shapes (kept local; deterministic select for the whole merge)
// ---------------------------------------------------------------------------

type LoadedCatalogItem = {
  id: string;
  jobtreadId: string;
  unit: string;
  unitCost: number | null;
  unitPrice: number | null;
};

type LoadedTemplateItem = {
  id: string;
  catalogItemId: string | null;
  jobtreadItemId: string | null;
  name: string;
  costCode: string | null;
  costType: string | null;
  sortOrder: number;
  isActive: boolean;
  catalogItem: LoadedCatalogItem | null;
};

type LoadedTradeGroup = {
  id: string;
  name: string;
  jobtreadGroupId: string | null;
  sortOrder: number;
  items: LoadedTemplateItem[];
};

type LoadedRoomTemplate = {
  id: string;
  tradeGroups: LoadedTradeGroup[];
};

type LoadedRoom = {
  id: string;
  name: string;
  sortOrder: number;
  isProjectOverhead: boolean;
  sectionType: { category: string } | null;
};

type LoadedEstimateLineItem = {
  id: string;
  catalogItemId: string | null;
  tradeGroup: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  source: string;
  notes: string | null;
  sortOrder: number;
};

type LoadedEstimate = {
  id: string;
  sectionId: string;
  createdAt: Date;
  roomTemplateId: string | null;
  lineItems: LoadedEstimateLineItem[];
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the template-overlay budget tree for a project.
 *
 * @param projectId `Project.id` to assemble.
 * @returns A pure {@link JobTreadBudgetTree}; rooms without an estimate are
 *          excluded and recorded in `roomsWithoutEstimate`; rooms without a
 *          template are built estimate-only and recorded in
 *          `roomsWithoutTemplate`. COPE rooms ordered last.
 */
export async function buildJobTreadBudgetTree(
  projectId: string,
): Promise<JobTreadBudgetTree> {
  const rooms = (await prisma.room.findMany({
    where: { projectId },
    orderBy: [{ isProjectOverhead: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      sortOrder: true,
      isProjectOverhead: true,
      sectionType: { select: { category: true } },
    },
  })) as LoadedRoom[];

  // Latest estimate (+ its line items) per room, in one query. Multiple
  // historical estimates per room are possible; keep only the most recent
  // (mirrors assembleProjectBudget()).
  const roomIds = rooms.map((r) => r.id);
  const estimates = (
    roomIds.length
      ? await prisma.aIEstimate.findMany({
          where: { sectionId: { in: roomIds } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            sectionId: true,
            createdAt: true,
            roomTemplateId: true,
            lineItems: {
              orderBy: [{ tradeGroup: "asc" }, { sortOrder: "asc" }],
              select: {
                id: true,
                catalogItemId: true,
                tradeGroup: true,
                name: true,
                quantity: true,
                unit: true,
                unitCost: true,
                unitPrice: true,
                source: true,
                notes: true,
                sortOrder: true,
              },
            },
          },
        })
      : []
  ) as LoadedEstimate[];

  const latestEstimateByRoomId = new Map<string, LoadedEstimate>();
  for (const est of estimates) {
    if (!latestEstimateByRoomId.has(est.sectionId)) {
      latestEstimateByRoomId.set(est.sectionId, est);
    }
  }

  // The template a room was actually estimated with lives on the AIEstimate
  // (`Room.roomTemplateId` is frequently null — the bulk estimate flow records
  // the chosen template on the estimate, not back on the room). Load those
  // templates by id and key the scaffold off them.
  const templateIds = Array.from(
    new Set(
      Array.from(latestEstimateByRoomId.values())
        .map((e) => e.roomTemplateId)
        .filter((id): id is string => id != null),
    ),
  );
  const templateById = new Map<string, LoadedRoomTemplate>();
  if (templateIds.length) {
    const templates = (await prisma.roomTemplate.findMany({
      where: { id: { in: templateIds } },
      select: {
        id: true,
        tradeGroups: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            jobtreadGroupId: true,
            sortOrder: true,
            items: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                catalogItemId: true,
                jobtreadItemId: true,
                name: true,
                costCode: true,
                costType: true,
                sortOrder: true,
                isActive: true,
                catalogItem: {
                  select: {
                    id: true,
                    jobtreadId: true,
                    unit: true,
                    unitCost: true,
                    unitPrice: true,
                  },
                },
              },
            },
          },
        },
      },
    })) as LoadedRoomTemplate[];
    for (const t of templates) templateById.set(t.id, t);
  }

  const outRooms: JTRoomGroup[] = [];
  const roomsWithoutTemplate: string[] = [];
  const roomsWithoutEstimate: string[] = [];

  for (const room of rooms) {
    const estimate = latestEstimateByRoomId.get(room.id);

    // Mirror assembleProjectBudget()'s skip logic: a room with no estimate (or
    // an estimate with zero line items) contributes nothing and is excluded.
    if (!estimate || estimate.lineItems.length === 0) {
      roomsWithoutEstimate.push(room.name);
      continue;
    }

    const template = estimate.roomTemplateId
      ? templateById.get(estimate.roomTemplateId) ?? null
      : null;
    const hasTemplate = template !== null;
    if (!hasTemplate) {
      roomsWithoutTemplate.push(room.name);
    }

    const trades = hasTemplate
      ? mergeRoomWithTemplate(template, estimate)
      : buildEstimateOnlyTrades(estimate);

    outRooms.push({
      roomId: room.id,
      roomName: room.name,
      sectionCategory: room.sectionType?.category ?? null,
      hasTemplate,
      isProjectOverhead: room.isProjectOverhead,
      trades,
    });
  }

  return {
    projectId,
    rooms: outRooms,
    roomsWithoutTemplate,
    roomsWithoutEstimate,
  };
}

// ---------------------------------------------------------------------------
// Per-room merge (room HAS a template → scaffold + overlay + extras)
// ---------------------------------------------------------------------------

/**
 * Build a working trade group with mutable lookup indexes for fast overlay.
 */
interface WorkingTradeGroup {
  group: JTTradeGroup;
  /** scaffold items indexed by catalogItemId (non-null only). */
  byCatalogId: Map<string, JTCostItem>;
  /** scaffold items indexed by jobtreadItemId (non-null only). */
  byJobtreadItemId: Map<string, JTCostItem>;
  /** scaffold items indexed by normalized name. */
  byNormalizedName: Map<string, JTCostItem>;
  /** scaffold items already consumed by an estimate overlay. */
  consumed: Set<JTCostItem>;
  /** next sortOrder to assign to appended EXTRA lines. */
  nextSortOrder: number;
}

function mergeRoomWithTemplate(
  template: LoadedRoomTemplate,
  estimate: LoadedEstimate,
): JTTradeGroup[] {
  // 1. SCAFFOLD — build a working group per template trade group.
  const workingByTradeName = new Map<string, WorkingTradeGroup>();
  const orderedWorking: WorkingTradeGroup[] = [];

  for (const tg of template.tradeGroups) {
    const items: JTCostItem[] = [];
    const byCatalogId = new Map<string, JTCostItem>();
    const byJobtreadItemId = new Map<string, JTCostItem>();
    const byNormalizedName = new Map<string, JTCostItem>();

    for (const ti of tg.items) {
      if (!ti.isActive) continue;
      const scaffold = scaffoldItemFromTemplate(ti);
      items.push(scaffold);

      if (ti.catalogItemId) byCatalogId.set(ti.catalogItemId, scaffold);
      const jtItemId = ti.jobtreadItemId ?? ti.catalogItem?.jobtreadId ?? null;
      if (jtItemId) byJobtreadItemId.set(jtItemId, scaffold);
      const norm = normalizeName(ti.name);
      // First occurrence wins on name collision so overlay is deterministic.
      if (norm && !byNormalizedName.has(norm)) byNormalizedName.set(norm, scaffold);
    }

    const group: JTTradeGroup = {
      tradeName: tg.name,
      jobtreadGroupId: tg.jobtreadGroupId,
      items,
      sortOrder: tg.sortOrder,
    };
    const working: WorkingTradeGroup = {
      group,
      byCatalogId,
      byJobtreadItemId,
      byNormalizedName,
      consumed: new Set<JTCostItem>(),
      nextSortOrder: items.length,
    };
    workingByTradeName.set(normalizeTradeName(tg.name), working);
    orderedWorking.push(working);
  }

  // 2. OVERLAY + 3. EXTRAS — walk the estimate lines in order.
  let extraTradeSortOrder = nextTradeSortOrder(orderedWorking);

  for (const line of estimate.lineItems) {
    const target = matchScaffold(line, workingByTradeName);
    if (target) {
      applyEstimateToScaffold(target.item, line);
      target.working.consumed.add(target.item);
      continue;
    }

    // EXTRA — append under its (possibly new) trade group.
    let working = workingByTradeName.get(normalizeTradeName(line.tradeGroup));
    if (!working) {
      const group: JTTradeGroup = {
        tradeName: line.tradeGroup,
        jobtreadGroupId: null,
        items: [],
        sortOrder: extraTradeSortOrder++,
      };
      working = {
        group,
        byCatalogId: new Map(),
        byJobtreadItemId: new Map(),
        byNormalizedName: new Map(),
        consumed: new Set<JTCostItem>(),
        nextSortOrder: 0,
      };
      workingByTradeName.set(normalizeTradeName(line.tradeGroup), working);
      orderedWorking.push(working);
    }
    working.group.items.push(
      extraItemFromEstimate(line, working.nextSortOrder++),
    );
  }

  // Stable output order: template trade sortOrder, then appended extra trades.
  const result = orderedWorking.map((w) => w.group);
  result.sort((a, b) => a.sortOrder - b.sortOrder);
  return result;
}

/**
 * Resolve which scaffold item an estimate line overlays, if any. Match
 * precedence: catalogItemId → jobtreadItemId (line's catalog ancestry) →
 * normalized name within the SAME trade group. A scaffold item already consumed
 * by an earlier estimate line is skipped so two estimate lines never collapse
 * onto one scaffold row.
 */
function matchScaffold(
  line: LoadedEstimateLineItem,
  workingByTradeName: Map<string, WorkingTradeGroup>,
): { working: WorkingTradeGroup; item: JTCostItem } | null {
  // catalogItemId and jobtreadItemId matches are GLOBAL across the room's
  // trades (a catalog item may live under a differently-named estimate trade),
  // so scan every working group for the first unconsumed hit.
  if (line.catalogItemId) {
    for (const working of workingByTradeName.values()) {
      const hit = working.byCatalogId.get(line.catalogItemId);
      if (hit && !working.consumed.has(hit)) return { working, item: hit };
    }
  }

  // Name matching is scoped to the SAME trade group only.
  const working = workingByTradeName.get(normalizeTradeName(line.tradeGroup));
  if (working) {
    const norm = normalizeName(line.name);
    if (norm) {
      const hit = working.byNormalizedName.get(norm);
      if (hit && !working.consumed.has(hit)) return { working, item: hit };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Per-room build (room has NO template → estimate-only, all EXTRA)
// ---------------------------------------------------------------------------

/**
 * Build trades for a template-less room directly from its estimate lines. No
 * scaffold exists, so every line is an `EXTRA`. Trade groups are created in the
 * order their first line is encountered.
 */
function buildEstimateOnlyTrades(estimate: LoadedEstimate): JTTradeGroup[] {
  const byTradeName = new Map<string, JTTradeGroup>();
  const ordered: JTTradeGroup[] = [];
  let tradeSortOrder = 0;

  for (const line of estimate.lineItems) {
    const key = normalizeTradeName(line.tradeGroup);
    let group = byTradeName.get(key);
    if (!group) {
      group = {
        tradeName: line.tradeGroup,
        jobtreadGroupId: null,
        items: [],
        sortOrder: tradeSortOrder++,
      };
      byTradeName.set(key, group);
      ordered.push(group);
    }
    group.items.push(extraItemFromEstimate(line, group.items.length));
  }

  return ordered;
}

// ---------------------------------------------------------------------------
// Line constructors
// ---------------------------------------------------------------------------

/**
 * Build a quantity-0 / $0 scaffold cost item from a template item. Carries the
 * template's cost code / cost type NAMES (ids resolved later) and the catalog
 * linkage (`jobtreadItemId`).
 */
function scaffoldItemFromTemplate(ti: LoadedTemplateItem): JTCostItem {
  return {
    name: ti.name,
    quantity: 0,
    unit: ti.catalogItem?.unit ?? "EA",
    unitCost: 0,
    unitPrice: 0,
    costCodeName: ti.costCode ?? null,
    costCodeId: null,
    costTypeName: ti.costType ?? null,
    costTypeId: null,
    notes: null, // scaffold-only line has no estimate → no AI notes
    allowanceType: null,
    lineSource: "TEMPLATE_SCAFFOLD" satisfies JTLineSource,
    templateItemId: ti.id,
    jobtreadItemId: ti.jobtreadItemId ?? ti.catalogItem?.jobtreadId ?? null,
    sortOrder: ti.sortOrder,
  };
}

/**
 * Overlay an estimate line onto a matched scaffold item: fill quantity/cost/
 * price, flip the line source to `ESTIMATE`, record the estimate line id, and
 * set the allowance type when the estimate line is an allowance. The scaffold's
 * cost code / cost type names and catalog linkage are PRESERVED (template is the
 * authority for coding).
 */
function applyEstimateToScaffold(
  scaffold: JTCostItem,
  line: LoadedEstimateLineItem,
): void {
  scaffold.quantity = line.quantity;
  scaffold.unitCost = line.unitCost;
  scaffold.unitPrice = line.unitPrice;
  // Prefer the estimate's unit when it carries one; fall back to the scaffold's
  // (catalog) unit already set.
  if (line.unit) scaffold.unit = line.unit;
  scaffold.lineSource = "ESTIMATE";
  scaffold.estimateLineItemId = line.id;
  scaffold.notes = line.notes ?? null; // carry the estimate's AI notes
  scaffold.allowanceType = line.source === "ALLOWANCE" ? "1" : null;
}

/**
 * Build an `EXTRA` cost item from an estimate line that matched no scaffold.
 * No template cost code / cost type, so those names are null (the resolver will
 * fuzzy-match from the trade name + cost-type hint later). `jobtreadItemId` is
 * null — extras have no template/catalog ancestry on this path (the catalog
 * relation isn't loaded for estimate lines), so linkage is left to the resolver.
 */
function extraItemFromEstimate(
  line: LoadedEstimateLineItem,
  sortOrder: number,
): JTCostItem {
  return {
    name: line.name,
    quantity: line.quantity,
    unit: line.unit || "EA",
    unitCost: line.unitCost,
    unitPrice: line.unitPrice,
    costCodeName: null,
    costCodeId: null,
    costTypeName: null,
    costTypeId: null,
    notes: line.notes ?? null, // carry the estimate's AI notes
    allowanceType: line.source === "ALLOWANCE" ? "1" : null,
    lineSource: "EXTRA" satisfies JTLineSource,
    estimateLineItemId: line.id,
    jobtreadItemId: null,
    sortOrder,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Next free trade sortOrder above all existing template trades. */
function nextTradeSortOrder(working: WorkingTradeGroup[]): number {
  let max = -1;
  for (const w of working) {
    if (w.group.sortOrder > max) max = w.group.sortOrder;
  }
  return max + 1;
}

/**
 * Normalize an item name for fuzzy overlay matching: strip a leading
 * `[PREFIX]` trade tag, lowercase, collapse whitespace, and drop characters
 * that vary cosmetically between template and estimate phrasings. Empty string
 * means "no usable key" (caller skips name matching).
 */
function normalizeName(name: string): string {
  return name
    .replace(/^\s*\[[^\]]*\]\s*/, "") // drop "[FRM] " style prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalize a trade-group name for grouping/lookup (case/space-insensitive). */
function normalizeTradeName(trade: string): string {
  return trade.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Derive the Material / Install / Sub hint from a line. Not consumed inside
 * merge.ts (the resolver runs later in the payload step), but exported so the
 * payload builders can reuse the exact same rule against a merged line's name +
 * cost type without re-deriving it differently.
 */
export function deriveCostTypeHint(
  name: string,
  costTypeName: string | null,
): CostTypeHint {
  const lowerName = name.toLowerCase();
  if (/-\s*material\b/.test(lowerName)) return "Material";
  if (/-\s*install\b/.test(lowerName)) return "Install";

  const ct = (costTypeName ?? "").toLowerCase();
  if (ct.includes("sub")) return "Sub";
  if (ct.includes("labor")) return "Install";
  if (ct.includes("material")) return "Material";

  return null;
}
