/**
 * Project budget assembler.
 *
 * Pure server-only function that pulls every AI-estimated line item for a
 * project, groups by room → trade, computes totals + low/high ranges, and
 * returns a structured tree suitable for either XLSX or PDF rendering.
 *
 * # Why a shared assembler
 * The XLSX export route and the PDF print view both need the exact same
 * tree, with identical totals math and identical range-fallback rules.
 * Computing it twice would invite the two outputs to drift. One source of
 * truth.
 *
 * # Range fallback rules
 * EstimateLineItem rows store totalPriceLow and totalPriceHigh as Floats.
 * Older rows (pre-range-storage) have these as 0 — in which case we fall
 * back to a percentage band around totalPrice using
 * CompanyContext.priceRangeLowPct / priceRangeHighPct (defaults -10 / +10).
 *
 * This mirrors the AIEstimatePanel logic exactly so the export matches
 * what estimators see on screen:
 *   - per-row:   low = totalPriceLow > 0 ? totalPriceLow : totalPrice
 *                high = totalPriceHigh > 0 ? totalPriceHigh : totalPrice
 *   - per-group: sum of per-row lows / highs
 *   - per-room:  sum of group lows / highs; if all rows stored zero (legacy
 *                estimate), fall back to round(total * (1 ± pct/100))
 *
 * # COPE handling
 * Rooms with isProjectOverhead=true are placed LAST in the rooms array
 * and tagged with `isProjectOverhead: true` so consumers can render them
 * visually separated (separate worksheet in XLSX, separate page section
 * in PDF).
 *
 * # Rooms without estimates
 * Rooms that have no AIEstimate are EXCLUDED from the export. Empty
 * "Drywall" rooms would just be noise in the spreadsheet. The summary
 * tab can report how many rooms were skipped if useful.
 *
 * # No `server-only` marker
 * This module deliberately omits `import "server-only"` so the smoke
 * script under scripts/smoke/ can exercise it directly. The transitive
 * Prisma import already makes it impossible to actually call from a
 * browser context (the Node-only postgres adapter won't load), and the
 * intended consumers (XLSX route, PDF print page) are both server
 * components by definition.
 */

import { prisma } from "@/app/lib/prisma";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BudgetExportTotals {
  /** Sum of totalPrice across all included rows. */
  target: number;
  /** Sum of per-row low (with fallback). */
  low: number;
  /** Sum of per-row high (with fallback). */
  high: number;
  /** Sum of totalCost across all included rows. */
  cost: number;
  itemCount: number;
}

export interface BudgetExportLineItem {
  id: string;
  tradeGroup: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
  /** With fallback applied — always > 0 when totalPrice > 0. */
  totalPriceLow: number;
  /** With fallback applied — always > 0 when totalPrice > 0. */
  totalPriceHigh: number;
  source: string;
  confidence: number | null;
  notes: string | null;
  sortOrder: number;
}

export interface BudgetExportTradeGroup {
  tradeGroup: string;
  items: BudgetExportLineItem[];
  totals: BudgetExportTotals;
}

export interface BudgetExportRoom {
  id: string;
  name: string;
  sortOrder: number;
  isProjectOverhead: boolean;
  estimateId: string;
  estimateStatus: string;
  estimateCreatedAt: Date;
  tradeGroups: BudgetExportTradeGroup[];
  totals: BudgetExportTotals;
}

export interface BudgetExportProject {
  id: string;
  title: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** Pre-formatted "First Last [& First2 Last2]" or null if no client names set. */
  clientName: string | null;
}

export interface BudgetExport {
  project: BudgetExportProject;
  exportedAt: Date;
  rooms: BudgetExportRoom[];
  /** Rooms in the project that had no AIEstimate (excluded from `rooms`). */
  skippedRoomNames: string[];
  rangeLowPct: number;
  rangeHighPct: number;
  /** Project-wide totals across all included rooms (COPE included). */
  totals: BudgetExportTotals;
}

/** Thrown when the project id doesn't resolve. */
export class BudgetExportProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = "BudgetExportProjectNotFoundError";
  }
}

// ─── Assembler ───────────────────────────────────────────────────────────────

const DEFAULT_LOW_PCT = -10;
const DEFAULT_HIGH_PCT = 10;

const EMPTY_TOTALS: BudgetExportTotals = {
  target: 0,
  low: 0,
  high: 0,
  cost: 0,
  itemCount: 0,
};

/**
 * Build the export tree for a project.
 *
 * Single round-trip to Postgres for the project + nested rooms + estimates +
 * line items. CompanyContext fetched in parallel.
 */
export async function assembleProjectBudget(
  projectId: string,
): Promise<BudgetExport> {
  const [project, context] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        addressLine1: true,
        city: true,
        state: true,
        zip: true,
        client1First: true,
        client1Last: true,
        client2First: true,
        client2Last: true,
        rooms: {
          orderBy: [{ isProjectOverhead: "asc" }, { sortOrder: "asc" }],
          select: {
            id: true,
            name: true,
            sortOrder: true,
            isProjectOverhead: true,
            // Only the most recent AIEstimate matters for export — but the
            // schema doesn't expose a relation back to "latest". In practice
            // a Room has at most one AIEstimate (the API replaces on
            // regenerate). Order by createdAt desc + take 1 to be safe.
            // (Multiple historical estimates would otherwise sum twice.)
          },
        },
      },
    }),
    prisma.companyContext.findFirst({
      select: { priceRangeLowPct: true, priceRangeHighPct: true },
    }),
  ]);
  if (!project) {
    throw new BudgetExportProjectNotFoundError(projectId);
  }

  const rangeLowPct = context?.priceRangeLowPct ?? DEFAULT_LOW_PCT;
  const rangeHighPct = context?.priceRangeHighPct ?? DEFAULT_HIGH_PCT;

  // Pull the latest AIEstimate per room with its line items.
  const roomIds = project.rooms.map((r) => r.id);
  const estimates = roomIds.length
    ? await prisma.aIEstimate.findMany({
        where: { sectionId: { in: roomIds } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          sectionId: true,
          status: true,
          createdAt: true,
          totalPrice: true,
          lineItems: {
            orderBy: [{ tradeGroup: "asc" }, { sortOrder: "asc" }],
            select: {
              id: true,
              tradeGroup: true,
              name: true,
              description: true,
              quantity: true,
              unit: true,
              unitCost: true,
              unitPrice: true,
              totalCost: true,
              totalPrice: true,
              totalPriceLow: true,
              totalPriceHigh: true,
              source: true,
              confidence: true,
              notes: true,
              sortOrder: true,
            },
          },
        },
      })
    : [];

  // Keep only the FIRST estimate per room (most recent due to desc order).
  const estimateByRoomId = new Map<string, (typeof estimates)[number]>();
  for (const e of estimates) {
    if (!estimateByRoomId.has(e.sectionId)) {
      estimateByRoomId.set(e.sectionId, e);
    }
  }

  const exportRooms: BudgetExportRoom[] = [];
  const skippedRoomNames: string[] = [];

  for (const room of project.rooms) {
    const est = estimateByRoomId.get(room.id);
    if (!est || est.lineItems.length === 0) {
      skippedRoomNames.push(room.name);
      continue;
    }

    const tradeGroups = buildTradeGroups(est.lineItems);
    const roomTotals = sumTotals(tradeGroups.map((g) => g.totals));

    // Per-room legacy fallback — if every row stored zero ranges, the
    // summed low/high collapse to zero. Fall back to a percentage band
    // around the room target. Mirrors AIEstimatePanel.rangeTotals.
    if (
      roomTotals.target > 0 &&
      (roomTotals.low <= 0 ||
        roomTotals.high <= 0 ||
        roomTotals.low === roomTotals.high)
    ) {
      roomTotals.low = Math.round(roomTotals.target * (1 + rangeLowPct / 100));
      roomTotals.high = Math.round(
        roomTotals.target * (1 + rangeHighPct / 100),
      );
    }

    exportRooms.push({
      id: room.id,
      name: room.name,
      sortOrder: room.sortOrder,
      isProjectOverhead: room.isProjectOverhead,
      estimateId: est.id,
      estimateStatus: est.status,
      estimateCreatedAt: est.createdAt,
      tradeGroups,
      totals: roomTotals,
    });
  }

  const projectTotals = sumTotals(exportRooms.map((r) => r.totals));

  return {
    project: {
      id: project.id,
      title: project.title,
      addressLine1: project.addressLine1,
      city: project.city,
      state: project.state,
      zip: project.zip,
      clientName: buildClientName(project),
    },
    exportedAt: new Date(),
    rooms: exportRooms,
    skippedRoomNames,
    rangeLowPct,
    rangeHighPct,
    totals: projectTotals,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type RawLineItem = {
  id: string;
  tradeGroup: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
  totalPriceLow: number;
  totalPriceHigh: number;
  source: string;
  confidence: number | null;
  notes: string | null;
  sortOrder: number;
};

function buildTradeGroups(items: RawLineItem[]): BudgetExportTradeGroup[] {
  const groups = new Map<string, BudgetExportLineItem[]>();
  for (const item of items) {
    const lowEffective =
      item.totalPriceLow > 0 ? item.totalPriceLow : item.totalPrice;
    const highEffective =
      item.totalPriceHigh > 0 ? item.totalPriceHigh : item.totalPrice;
    const enriched: BudgetExportLineItem = {
      id: item.id,
      tradeGroup: item.tradeGroup,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitCost: item.unitCost,
      unitPrice: item.unitPrice,
      totalCost: item.totalCost,
      totalPrice: item.totalPrice,
      totalPriceLow: lowEffective,
      totalPriceHigh: highEffective,
      source: item.source,
      confidence: item.confidence,
      notes: item.notes,
      sortOrder: item.sortOrder,
    };
    const arr = groups.get(item.tradeGroup);
    if (arr) arr.push(enriched);
    else groups.set(item.tradeGroup, [enriched]);
  }

  const result: BudgetExportTradeGroup[] = [];
  for (const [trade, groupItems] of groups) {
    const totals: BudgetExportTotals = {
      target: 0,
      low: 0,
      high: 0,
      cost: 0,
      itemCount: groupItems.length,
    };
    for (const item of groupItems) {
      totals.target += item.totalPrice;
      totals.low += item.totalPriceLow;
      totals.high += item.totalPriceHigh;
      totals.cost += item.totalCost;
    }
    result.push({ tradeGroup: trade, items: groupItems, totals });
  }
  // Stable display order: alphabetical by trade name. The panel uses a
  // hand-curated trade order array, but for an export we want predictable
  // alphabetical so estimators can scan.
  result.sort((a, b) =>
    a.tradeGroup.localeCompare(b.tradeGroup, undefined, {
      sensitivity: "base",
    }),
  );
  return result;
}

function sumTotals(parts: BudgetExportTotals[]): BudgetExportTotals {
  const result: BudgetExportTotals = { ...EMPTY_TOTALS };
  for (const t of parts) {
    result.target += t.target;
    result.low += t.low;
    result.high += t.high;
    result.cost += t.cost;
    result.itemCount += t.itemCount;
  }
  return result;
}

function buildClientName(project: {
  client1First: string | null;
  client1Last: string | null;
  client2First: string | null;
  client2Last: string | null;
}): string | null {
  const c1 = [project.client1First, project.client1Last]
    .map((s) => s?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  const c2 = [project.client2First, project.client2Last]
    .map((s) => s?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  if (c1 && c2) return `${c1} & ${c2}`;
  return c1 || c2 || null;
}
