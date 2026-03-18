'use server';

import { prisma } from '@/app/lib/prisma';
import { requireAdmin } from '@/app/lib/auth';
import { revalidatePath } from 'next/cache';
import { getGroupPathAndRoom, dedupePricingItems } from '../dedupe';
import { classifyPricingGroup } from '@/app/integrations/jobtread-pricing-classify';
import {
  type JobPricingReconciliation,
  runBudgetTextDiffForJob,
  getOfficialMatchedTotals,
} from '@/app/integrations/jobtread-pricing';

// Legacy JobTread pricingImport* / snapshot models were removed from the Prisma schema.
// For debug-only tooling that still references these tables, we intentionally access them
// through an `any`-typed prisma handle to avoid TypeScript compile errors. At runtime,
// these operations will fail if the legacy models are not present.
const prismaAny = prisma as any;

export async function getPricingImportSources() {
  await requireAdmin();

  const projects = await prismaAny.pricingImportProject.findMany({
    orderBy: { jobName: 'asc' },
    include: {
      groups: true,
      items: true,
    },
  });

  const result = await Promise.all(
    projects.map(async (project: any) => {
    const groups = project.groups;
    const items = project.items;

    const groupsById = new Map(groups.map((g: any) => [g.id, g]));
    const groupsByJobtreadId = new Map(
      groups.map((g: any) => [g.jobtreadGroupId, g]),
    );
    const childrenByParentJobtreadId = new Map<string | null, typeof groups>();
    for (const g of groups) {
      const key = g.parentJobtreadGroupId ?? null;
      const list = childrenByParentJobtreadId.get(key) ?? [];
      list.push(g);
      childrenByParentJobtreadId.set(key, list);
    }

    const itemsWithPath = items.map((item: any) => {
      const group = item.groupId ? groupsById.get(item.groupId) : null;
      const { groupPath, roomKey } = group
        ? getGroupPathAndRoom(group as any, groupsByJobtreadId as any)
        : { groupPath: '(ungrouped)', roomKey: null };
      return {
        id: item.id,
        jobtreadItemId: item.jobtreadItemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        includeInPricing: item.includeInPricing,
        roomKey,
        groupPath,
      };
    });
    const { items: dedupedItems } = dedupePricingItems(itemsWithPath);
    const keptIds = new Set(dedupedItems.map((i) => i.id));

    // Snapshot-qualified group ids: valid top-level room groups + all descendants (same filter as buildRoomSnapshotsFromJobs). Used so Sources project totals align with snapshot sum.
    const topLevelGroups = groups.filter(
      (g: any) => g.parentJobtreadGroupId === null,
    );
    const snapshotQualifiedGroupIds = new Set<string>();
    for (const g of topLevelGroups) {
      const classification = classifyPricingGroup(g.name);
      if (classification.isValidPricingGroup !== true) continue;
      const stack: string[] = [g.jobtreadGroupId];
      const visited = new Set<string>();
      while (stack.length > 0) {
        const jtid = stack.pop()!;
        if (visited.has(jtid)) continue;
        visited.add(jtid);
    const grp =
      groupsByJobtreadId.get(jtid) ??
      groups.find((x: any) => x.jobtreadGroupId === jtid);
        if (grp) {
          snapshotQualifiedGroupIds.add(grp.id);
          const children = childrenByParentJobtreadId.get(jtid) ?? [];
          for (const c of children) stack.push(c.jobtreadGroupId);
        }
      }
    }

    const itemsByGroupId = new Map<string, typeof items>();
    const ungroupedItems: typeof items = [];
    for (const item of items) {
      if (!keptIds.has(item.id)) continue;
      if (item.groupId) {
        const list = itemsByGroupId.get(item.groupId) ?? [];
        list.push(item);
        itemsByGroupId.set(item.groupId, list);
      } else {
        ungroupedItems.push(item);
      }
    }

    function extendedSell(i: (typeof items)[number]): number {
      return (i.quantity ?? 0) * (i.unitPrice ?? 0);
    }

    function extendedCost(i: (typeof items)[number]): number {
      return (i.quantity ?? 0) * (i.unitCost ?? 0);
    }

    function isFlooringInstallItem(groupName: string, itemName: string): boolean {
      const combined = `${groupName} ${itemName}`.toLowerCase();
      if (!/floor|tile|lvp|vinyl|plank|laminate|hardwood|carpet/.test(combined)) {
        return false;
      }
      const allowPhrases = [
        'install',
        'installation',
        'flooring install',
        'new flooring install',
        'lay ',
        'laying',
        'set tile',
        'tile install',
        'tile installation',
        'wood floor install',
        'lvp install',
      ];
      const denyPhrases = [
        'patch',
        'repair',
        'prep',
        'leveler',
        'leveling',
        'self leveler',
        'grind',
        'grinding',
        'underlayment',
        'waterproof',
        'membrane',
        'demo',
        'demolition',
        'remove',
        'removal',
        'protection',
        'ram board',
        'masking',
        'cleanup',
        'clean',
        'polish',
        'stain',
        'refinish',
        'touch-up',
        'touch up',
      ];

      let hasAllow = false;
      for (const phrase of allowPhrases) {
        if (combined.includes(phrase)) {
          hasAllow = true;
          break;
        }
      }
      if (!hasAllow) return false;
      for (const phrase of denyPhrases) {
        if (combined.includes(phrase)) return false;
      }
      return true;
    }

    function computeGroupRollups(group: (typeof groups)[number]) {
      const stack: (typeof groups)[number][] = [group];
      const groupIds = new Set<string>();
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (groupIds.has(current.id)) continue;
        groupIds.add(current.id);
        const children =
          childrenByParentJobtreadId.get(current.jobtreadGroupId) ?? [];
        for (const child of children) stack.push(child);
      }

      let sellTotal = 0;
      let costTotal = 0;
      let flooringSf = 0;

      for (const groupId of groupIds) {
        const grp = groupsById.get(groupId);
        const groupItems = itemsByGroupId.get(groupId) ?? [];
        for (const item of groupItems) {
          if (!item.includeInPricing) continue;
          sellTotal += extendedSell(item);
          costTotal += extendedCost(item);
          if (grp && isFlooringInstallItem((grp as any).name, item.name)) {
            flooringSf += item.quantity ?? 0;
          }
        }
      }

      const sellPerSf =
        flooringSf > 0 && Number.isFinite(sellTotal / flooringSf)
          ? sellTotal / flooringSf
          : null;
      const costPerSf =
        flooringSf > 0 && Number.isFinite(costTotal / flooringSf)
          ? costTotal / flooringSf
          : null;

      return { sellTotal, costTotal, flooringSf, sellPerSf, costPerSf };
    }

    function buildGroupTree(
      parentJobtreadId: string | null,
      depth: number,
    ): {
      id: string;
      jobtreadGroupId: string;
      name: string;
      depth: number;
      normalizedPricingGroup: string | null;
      groupKind: string | null;
      isValidPricingGroup: boolean;
      includeInPricing: boolean;
      benchmarkGroupOverride: string | null;
      rollups: {
        sellTotal: number;
        costTotal: number;
        flooringSf: number;
        sellPerSf: number | null;
        costPerSf: number | null;
      };
      children: ReturnType<typeof buildGroupTree>;
      items: {
        id: string;
        jobtreadItemId: string;
        name: string;
        quantity: number;
        unitPrice: number;
        unitCost: number;
        includeInPricing: boolean;
        extendedSell: number;
        extendedCost: number;
      }[];
    }[] {
      const children = childrenByParentJobtreadId.get(parentJobtreadId) ?? [];
      return children.map((g: any) => {
        const rollups = computeGroupRollups(g);
        const childGroups = buildGroupTree(g.jobtreadGroupId, depth + 1);
        const directItems = itemsByGroupId.get(g.id) ?? [];

        return {
          id: g.id,
          jobtreadGroupId: g.jobtreadGroupId,
          name: g.name,
          depth,
          normalizedPricingGroup: g.normalizedPricingGroup,
          groupKind: g.groupKind,
          isValidPricingGroup: g.isValidPricingGroup,
          includeInPricing: g.includeInPricing,
          benchmarkGroupOverride:
            (g as { benchmarkGroupOverride?: string | null }).benchmarkGroupOverride ??
            null,
          rollups,
          children: childGroups,
          items: directItems.map((i: any) => ({
            id: i.id,
            jobtreadItemId: i.jobtreadItemId,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            unitCost: i.unitCost,
            includeInPricing: i.includeInPricing,
            extendedSell: extendedSell(i),
            extendedCost: extendedCost(i),
          })),
        };
      });
    }

    // Project-level rollups from included items only. Use same filtered set as snapshots (only items under valid room groups) so Sources totals align with snapshot sum.
    let projectSellTotal = 0;
    let projectCostTotal = 0;
    let projectFlooringSf = 0;

    for (const item of items) {
      if (!keptIds.has(item.id) || !item.includeInPricing) continue;
      const inSnapshotRoom = item.groupId != null && snapshotQualifiedGroupIds.has(item.groupId);
      if (!inSnapshotRoom) continue;
      projectSellTotal += extendedSell(item);
      projectCostTotal += extendedCost(item);
      const grp = item.groupId ? groupsById.get(item.groupId) : null;
      if (grp && isFlooringInstallItem((grp as any).name, item.name)) {
        projectFlooringSf += item.quantity ?? 0;
      }
    }

    const projectSellPerSf =
      projectFlooringSf > 0 && Number.isFinite(projectSellTotal / projectFlooringSf)
        ? projectSellTotal / projectFlooringSf
        : null;
    const projectCostPerSf =
      projectFlooringSf > 0 && Number.isFinite(projectCostTotal / projectFlooringSf)
        ? projectCostTotal / projectFlooringSf
        : null;

    if (project.jobName === '125 South Shore #1302') {
      // eslint-disable-next-line no-console
      console.log(
        '[JobTread pricing][debug][125 South Shore #1302] Source project totals:',
        {
          projectId: project.id,
          jobId: project.jobId,
          sellTotal: projectSellTotal,
          costTotal: projectCostTotal,
          flooringSf: projectFlooringSf,
          sellPerSf: projectSellPerSf,
          costPerSf: projectCostPerSf,
        },
      );
      void logSourceSnapshotBudgetReconciliationIf125SouthShore(project.jobId, project.jobName);
    }

    const analyticalSellTotal = projectSellTotal;
    const analyticalCostTotal = projectCostTotal;

    let officialSellTotal: number | null = null;
    let officialCostTotal: number | null = null;
    try {
      // Legacy official totals lookup currently disabled; keep analytical-only totals.
      await getOfficialMatchedTotals();
    } catch {
      // If official totals are not available, fall back to analytical-only (already null).
      officialSellTotal = null;
      officialCostTotal = null;
    }

    return {
      id: project.id,
      jobId: project.jobId,
      jobName: project.jobName,
      includeInPricing: project.includeInPricing,
      lastSyncedAt: project.lastSyncedAt?.toISOString() ?? null,
      rollups: {
        sellTotal: projectSellTotal,
        costTotal: projectCostTotal,
        flooringSf: projectFlooringSf,
        sellPerSf: projectSellPerSf,
        costPerSf: projectCostPerSf,
        officialSellTotal,
        officialCostTotal,
        analyticalSellTotal,
        analyticalCostTotal,
      },
      groups: buildGroupTree(null, 0),
      ungroupedItems: ungroupedItems.map((i: any) => ({
        id: i.id,
        jobtreadItemId: i.jobtreadItemId,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unitCost: i.unitCost,
        includeInPricing: i.includeInPricing,
        extendedSell: extendedSell(i),
        extendedCost: extendedCost(i),
      })),
    };
  }),
  );

  return result;
}

export type PricingImportReconciliationRow = {
  id: string;
  jobtreadItemId: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  extendedSell: number;
  extendedCost: number;
  includeInPricing: boolean;
  normalizedPricingGroup: string | null;
  groupKind: string | null;
};

export type PricingImportReconciliation = {
  jobId: string;
  jobName: string;
  expectedSellTotal: number;
  expectedCostTotal: number;
  appSellTotalIncluded: number;
  appCostTotalIncluded: number;
  appSellTotalAll: number;
  appCostTotalAll: number;
  sellVarianceIncluded: number;
  costVarianceIncluded: number;
  rows: PricingImportReconciliationRow[];
  duplicateJobtreadItemIds: string[];
  topOverageContributors: PricingImportReconciliationRow[];
};

export type RepeatedItemPath = {
  pathKey: string;
  roomKey: string | null;
  groupPath: string;
  hasRoom: boolean;
  items: (PricingImportReconciliationRow & {
    projectCreatedAt: Date;
    projectUpdatedAt: Date;
    groupJobtreadId: string | null;
    groupCreatedAt: Date | null;
    groupUpdatedAt: Date | null;
    itemCreatedAt: Date;
    itemUpdatedAt: Date;
  })[];
  pathSellTotal: number;
  pathCostTotal: number;
};

export type SuspiciousRepeatSet = {
  coreKey: string;
  normalizedName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  suspiciousPaths: RepeatedItemPath[];
  suspiciousSellTotal: number;
  suspiciousCostTotal: number;
};

export type CrossRoomRepeatSet = {
  coreKey: string;
  normalizedName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  paths: RepeatedItemPath[];
};

export type DuplicateScopeAnalysis = {
  jobId: string;
  jobName: string;
  suspiciousSets: SuspiciousRepeatSet[];
  crossRoomSets: CrossRoomRepeatSet[];
  suspiciousSellSubtotal: number;
  suspiciousCostSubtotal: number;
  itemsWithNoRoomOrGroupPath: number;
};

export type PricingDedupeMetrics = {
  rowsRemoved: number;
  sellRemoved: number;
  costRemoved: number;
};

/** Aggregate path-aware dedupe metrics across all projects (same logic as sources totals and snapshot generation). */
export async function getPricingDedupeMetrics(): Promise<PricingDedupeMetrics> {
  await requireAdmin();

  const projects = await prismaAny.pricingImportProject.findMany({
    include: { groups: true, items: true },
  });

  let rowsRemoved = 0;
  let sellRemoved = 0;
  let costRemoved = 0;

  for (const project of projects) {
    const groups = project.groups;
    const items = project.items;
    const groupsById = new Map(groups.map((g: any) => [g.id, g]));
    const groupsByJobtreadId = new Map(
      groups.map((g: any) => [g.jobtreadGroupId, g]),
    );

    const itemsWithPath = items.map((item: any) => {
      const group = item.groupId ? groupsById.get(item.groupId) : null;
      const { groupPath, roomKey } = group
        ? getGroupPathAndRoom(group as any, groupsByJobtreadId as any)
        : { groupPath: '(ungrouped)', roomKey: null };
      return {
        id: item.id,
        jobtreadItemId: item.jobtreadItemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        includeInPricing: item.includeInPricing,
        roomKey,
        groupPath,
      };
    });
    const { metrics } = dedupePricingItems(itemsWithPath);
    rowsRemoved += metrics.rowsRemoved;
    sellRemoved += metrics.sellRemoved;
    costRemoved += metrics.costRemoved;
  }

  return { rowsRemoved, sellRemoved, costRemoved };
}

// --- App vs JobTread budget reconciliation ---

/** One row from JobTread budget (e.g. jobtread_get_job_budget / DataX). */
export type BudgetRow = {
  groupPath?: string | null;
  roomKey?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  costCode?: string | null;
  type?: string | null;
};

/** One deduped app row with path (used in app totals). */
export type DedupedAppRow = {
  jobtreadItemId: string;
  groupPath: string;
  roomKey: string | null;
  groupName: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  extendedSell: number;
  extendedCost: number;
};

export type AppVsBudgetReconciliation = {
  jobId: string;
  jobName: string;
  appRowCount: number;
  appSellTotal: number;
  appCostTotal: number;
  budgetRowCount: number;
  budgetSellTotal: number;
  budgetCostTotal: number;
  unmatchedAppRows: DedupedAppRow[];
  unmatchedSellSubtotal: number;
  unmatchedCostSubtotal: number;
  groupedUnmatched: { groupName: string; roomPath: string; costCode: string; type: string; rowCount: number; sellSubtotal: number; costSubtotal: number }[];
  /** Unmatched subtotals by room (roomPath). */
  subtotalsByRoom: { roomPath: string; rowCount: number; sellSubtotal: number; costSubtotal: number }[];
  /** Unmatched subtotals by group (groupName). */
  subtotalsByGroup: { groupName: string; rowCount: number; sellSubtotal: number; costSubtotal: number }[];
  topCostContributors: DedupedAppRow[];
  recommendation: string;
};

function normalizeNameForMatch(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchKey(
  name: string,
  groupPath: string,
  roomKey: string | null,
  quantity: number,
  unitPrice: number,
  unitCost: number,
): string {
  const n = normalizeNameForMatch(name);
  const r = roomKey ?? '(no-room)';
  const q = Number(quantity.toFixed(6));
  const up = Number(unitPrice.toFixed(4));
  const uc = Number(unitCost.toFixed(4));
  return [n, r, groupPath, q, up, uc].join('|');
}

/** Returns deduped app rows for a job (same set used in app totals). */
export async function getDedupedAppRowsForJob(
  jobId: string,
): Promise<{ rows: DedupedAppRow[]; appSellTotal: number; appCostTotal: number } | null> {
  await requireAdmin();

  const project = await prismaAny.pricingImportProject.findUnique({
    where: { jobId },
    include: { groups: true, items: true },
  });
  if (!project) return null;

  const groups = project.groups;
  const items = project.items;
  const groupsById = new Map(groups.map((g: any) => [g.id, g]));
  const groupsByJobtreadId = new Map(
    groups.map((g: any) => [g.jobtreadGroupId, g]),
  );

  const itemsWithPath = items.map((item: any) => {
    const group = item.groupId ? groupsById.get(item.groupId) : null;
    const { groupPath, roomKey } = group
      ? getGroupPathAndRoom(group as any, groupsByJobtreadId as any)
      : { groupPath: '(ungrouped)', roomKey: null };
    return {
      id: item.id,
      jobtreadItemId: item.jobtreadItemId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      includeInPricing: item.includeInPricing,
      roomKey,
      groupPath,
    };
  });
  const { items: dedupedItems } = dedupePricingItems(itemsWithPath);
  const keptIds = new Set(dedupedItems.map((i) => i.id));

  const rows: DedupedAppRow[] = [];
  let appSellTotal = 0;
  let appCostTotal = 0;

  for (const item of items as any[]) {
    if (!keptIds.has(item.id) || !item.includeInPricing) continue;
    const group = item.groupId ? groupsById.get(item.groupId) : null;
    const { groupPath, roomKey } = group
      ? getGroupPathAndRoom(group as any, groupsByJobtreadId as any)
      : { groupPath: '(ungrouped)', roomKey: null };
    const quantity = item.quantity ?? 0;
    const unitPrice = item.unitPrice ?? 0;
    const unitCost = item.unitCost ?? 0;
    const extendedSell = quantity * unitPrice;
    const extendedCost = quantity * unitCost;
    const groupName = (group as any)?.name ?? '(ungrouped)';
    rows.push({
      jobtreadItemId: item.jobtreadItemId,
      groupPath,
      roomKey,
      groupName,
      name: item.name,
      quantity,
      unitPrice,
      unitCost,
      extendedSell,
      extendedCost,
    });
    appSellTotal += extendedSell;
    appCostTotal += extendedCost;
  }

  return { rows, appSellTotal, appCostTotal };
}

/** Reconcile deduped app rows vs JobTread budget rows; identify unmatched app rows and overage. */
export async function reconcileAppVsBudget(
  jobId: string,
  budgetRows: BudgetRow[],
): Promise<AppVsBudgetReconciliation | null> {
  await requireAdmin();

  const appData = await getDedupedAppRowsForJob(jobId);
  if (!appData) return null;

  const project = await prismaAny.pricingImportProject.findUnique({
    where: { jobId },
    select: { jobName: true },
  });
  if (!project) return null;

  const { rows: appRows, appSellTotal, appCostTotal } = appData;

  const budgetKeySet = new Set<string>();
  let budgetSellTotal = 0;
  let budgetCostTotal = 0;
  for (const b of budgetRows) {
    const key = matchKey(
      b.name,
      b.groupPath ?? '(ungrouped)',
      b.roomKey ?? null,
      b.quantity,
      b.unitPrice,
      b.unitCost,
    );
    budgetKeySet.add(key);
    budgetSellTotal += b.quantity * b.unitPrice;
    budgetCostTotal += b.quantity * b.unitCost;
  }

  const unmatchedAppRows: DedupedAppRow[] = [];
  for (const row of appRows) {
    const key = matchKey(
      row.name,
      row.groupPath,
      row.roomKey,
      row.quantity,
      row.unitPrice,
      row.unitCost,
    );
    if (!budgetKeySet.has(key)) {
      unmatchedAppRows.push(row);
    }
  }

  const unmatchedSellSubtotal = unmatchedAppRows.reduce((s, r) => s + r.extendedSell, 0);
  const unmatchedCostSubtotal = unmatchedAppRows.reduce((s, r) => s + r.extendedCost, 0);

  const groupKeyToAgg = new Map<
    string,
    { groupName: string; roomPath: string; costCode: string; type: string; rowCount: number; sellSubtotal: number; costSubtotal: number }
  >();
  for (const row of unmatchedAppRows) {
    const roomPath = row.roomKey ?? row.groupPath;
    const costCode = row.groupName;
    const type = row.groupPath;
    const key = [row.groupName, roomPath, costCode, type].join('\n');
    let agg = groupKeyToAgg.get(key);
    if (!agg) {
      agg = { groupName: row.groupName, roomPath, costCode, type, rowCount: 0, sellSubtotal: 0, costSubtotal: 0 };
      groupKeyToAgg.set(key, agg);
    }
    agg.rowCount += 1;
    agg.sellSubtotal += row.extendedSell;
    agg.costSubtotal += row.extendedCost;
  }
  const groupedUnmatched = Array.from(groupKeyToAgg.values()).sort(
    (a, b) => b.costSubtotal - a.costSubtotal,
  );

  const topCostContributors = [...unmatchedAppRows]
    .sort((a, b) => b.extendedCost - a.extendedCost)
    .slice(0, 25);

  const byRoom = new Map<string, { rowCount: number; sellSubtotal: number; costSubtotal: number }>();
  const byGroup = new Map<string, { rowCount: number; sellSubtotal: number; costSubtotal: number }>();
  for (const row of unmatchedAppRows) {
    const roomPath = row.roomKey ?? row.groupPath;
    const r = byRoom.get(roomPath) ?? { rowCount: 0, sellSubtotal: 0, costSubtotal: 0 };
    r.rowCount += 1;
    r.sellSubtotal += row.extendedSell;
    r.costSubtotal += row.extendedCost;
    byRoom.set(roomPath, r);
    const g = byGroup.get(row.groupName) ?? { rowCount: 0, sellSubtotal: 0, costSubtotal: 0 };
    g.rowCount += 1;
    g.sellSubtotal += row.extendedSell;
    g.costSubtotal += row.extendedCost;
    byGroup.set(row.groupName, g);
  }
  const subtotalsByRoom = Array.from(byRoom.entries())
    .map(([roomPath, v]) => ({ roomPath, ...v }))
    .sort((a, b) => b.costSubtotal - a.costSubtotal);
  const subtotalsByGroup = Array.from(byGroup.entries())
    .map(([groupName, v]) => ({ groupName, ...v }))
    .sort((a, b) => b.costSubtotal - a.costSubtotal);

  let recommendation: string;
  if (unmatchedAppRows.length === 0) {
    recommendation =
      'App totals match budget. No change needed; current source (imported costItems with dedupe) is consistent with JobTread budget.';
  } else if (unmatchedCostSubtotal > 100000) {
    recommendation =
      'Totals, snapshots, and benchmarks should switch from raw imported costItems to a normalized JobTread budget view as the source of truth. Large cost overage comes from app rows not present in the live JobTread budget; using jobtread_get_job_budget (or equivalent) for pricing totals will eliminate double-counting and scope drift.';
  } else {
    recommendation =
      'Moderate overage from unmatched app rows. Review top contributors; either exclude these from pricing (e.g. via includeInPricing) or adopt JobTread budget as source of truth for totals/snapshots/benchmarks.';
  }

  return {
    jobId,
    jobName: project.jobName,
    appRowCount: appRows.length,
    appSellTotal,
    appCostTotal,
    budgetRowCount: budgetRows.length,
    budgetSellTotal,
    budgetCostTotal,
    unmatchedAppRows,
    unmatchedSellSubtotal,
    unmatchedCostSubtotal,
    groupedUnmatched,
    subtotalsByRoom,
    subtotalsByGroup,
    topCostContributors,
    recommendation,
  };
}

// --- Source vs snapshot vs budget reconciliation (125 South Shore #1302) ---

/** Live JobTread budget totals from DataX for 125 South Shore #1302 (source-of-truth comparison). */
const BUDGET_SELL_125_SOUTH_SHORE = 865_121.4959172342;
const BUDGET_COST_125_SOUTH_SHORE = 532_318.7892911092;

export type SourceSnapshotBudgetReconciliation = {
  jobId: string;
  jobName: string;
  sourceSell: number;
  sourceCost: number;
  snapshotSumSell: number;
  snapshotSumCost: number;
  budgetSell: number;
  budgetCost: number;
  /** Item ids (and extended sell/cost) that are in source totals but not under any snapshot room (invalid/non-room groups or ungrouped). */
  itemsInSourceNotInSnapshot: { id: string; jobtreadItemId: string; name: string; groupPath: string; extendedSell: number; extendedCost: number }[];
  sellInSourceNotInSnapshot: number;
  costInSourceNotInSnapshot: number;
};

/**
 * Reconcile source project totals vs sum of curated snapshots vs JobTread budget.
 * Identifies items counted in Sources but not in any snapshot (non-room groups or ungrouped).
 */
export async function getSourceSnapshotBudgetReconciliation(
  jobId: string,
): Promise<SourceSnapshotBudgetReconciliation | null> {
  await requireAdmin();

  const project = await prismaAny.pricingImportProject.findUnique({
    where: { jobId },
    include: { groups: true, items: true },
  });
  if (!project) return null;

  const groups = project.groups;
  const items = project.items;
  const groupsById = new Map(groups.map((g: any) => [g.id, g]));
  const groupsByJobtreadId = new Map(
    groups.map((g: any) => [g.jobtreadGroupId, g]),
  );
  const itemsWithPath = items.map((item: any) => {
    const group = item.groupId ? groupsById.get(item.groupId) : null;
    const { groupPath, roomKey } = group
      ? getGroupPathAndRoom(group as any, groupsByJobtreadId as any)
      : { groupPath: '(ungrouped)', roomKey: null };
    return {
      id: item.id,
      jobtreadItemId: item.jobtreadItemId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      includeInPricing: item.includeInPricing,
      roomKey,
      groupPath,
    };
  });
  const { items: dedupedItems } = dedupePricingItems(itemsWithPath);
  const keptIds = new Set(dedupedItems.map((i) => i.id));

  const snapshots = await prismaAny.pricingRoomSnapshot.findMany({
    where: { jobId },
    select: { sellTotal: true, costTotal: true },
  });
  const snapshotSumSell = snapshots.reduce(
    (s: number, n: any) => s + n.sellTotal,
    0,
  );
  const snapshotSumCost = snapshots.reduce(
    (s: number, n: any) => s + n.costTotal,
    0,
  );

  const budgetSell = jobId === '22PJXd2cjdhN' ? BUDGET_SELL_125_SOUTH_SHORE : 0;
  const budgetCost = jobId === '22PJXd2cjdhN' ? BUDGET_COST_125_SOUTH_SHORE : 0;

  const childrenByParentJobtreadId = new Map<string | null, typeof groups>();
  for (const g of groups) {
    const key = g.parentJobtreadGroupId ?? null;
    const list = childrenByParentJobtreadId.get(key) ?? [];
    list.push(g);
    childrenByParentJobtreadId.set(key, list);
  }
  const topLevelGroups = groups.filter(
    (g: any) => g.parentJobtreadGroupId === null,
  );
  const snapshotQualifiedGroupIds = new Set<string>();
  for (const g of topLevelGroups) {
    const classification = classifyPricingGroup(g.name);
    if (classification.isValidPricingGroup !== true) continue;
    const stack: string[] = [g.jobtreadGroupId];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const jtid = stack.pop()!;
      if (visited.has(jtid)) continue;
      visited.add(jtid);
      const grp =
        groupsByJobtreadId.get(jtid) ??
        groups.find((x: any) => x.jobtreadGroupId === jtid);
      if (grp) {
        snapshotQualifiedGroupIds.add(grp.id);
        const children = childrenByParentJobtreadId.get(jtid) ?? [];
        for (const c of children) stack.push(c.jobtreadGroupId);
      }
    }
  }

  const itemsInSourceNotInSnapshot: SourceSnapshotBudgetReconciliation['itemsInSourceNotInSnapshot'] = [];
  let sellInSourceNotInSnapshot = 0;
  let costInSourceNotInSnapshot = 0;
  let sourceSell = 0;
  let sourceCost = 0;
  for (const item of items) {
    if (!keptIds.has(item.id) || !item.includeInPricing) continue;
    const extendedSell = (item.quantity ?? 0) * (item.unitPrice ?? 0);
    const extendedCost = (item.quantity ?? 0) * (item.unitCost ?? 0);
    const inSnapshot = item.groupId != null && snapshotQualifiedGroupIds.has(item.groupId);
    if (inSnapshot) {
      sourceSell += extendedSell;
      sourceCost += extendedCost;
      continue;
    }
    const group = item.groupId ? groupsById.get(item.groupId) : null;
    const groupPath = group
      ? getGroupPathAndRoom(group as any, groupsByJobtreadId as any).groupPath
      : '(ungrouped)';
    itemsInSourceNotInSnapshot.push({
      id: item.id,
      jobtreadItemId: item.jobtreadItemId,
      name: item.name,
      groupPath,
      extendedSell,
      extendedCost,
    });
    sellInSourceNotInSnapshot += extendedSell;
    costInSourceNotInSnapshot += extendedCost;
  }

  return {
    jobId: project.jobId,
    jobName: project.jobName,
    sourceSell,
    sourceCost,
    snapshotSumSell,
    snapshotSumCost,
    budgetSell,
    budgetCost,
    itemsInSourceNotInSnapshot,
    sellInSourceNotInSnapshot,
    costInSourceNotInSnapshot,
  };
}

/** Log reconciliation for 125 South Shore #1302 (call from debug page or when loading sources). */
export async function logSourceSnapshotBudgetReconciliationIf125SouthShore(
  jobId: string,
  jobName: string,
): Promise<void> {
  if (jobId !== '22PJXd2cjdhN' || jobName !== '125 South Shore #1302') return;
  const rec = await getSourceSnapshotBudgetReconciliation(jobId);
  if (!rec) return;
  const format = (n: number) =>
    Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  // eslint-disable-next-line no-console
  console.log('[JobTread pricing][125 South Shore] Source vs snapshot vs budget:', {
    sourceSell: format(rec.sourceSell),
    sourceCost: format(rec.sourceCost),
    snapshotSumSell: format(rec.snapshotSumSell),
    snapshotSumCost: format(rec.snapshotSumCost),
    budgetSell: format(rec.budgetSell),
    budgetCost: format(rec.budgetCost),
    rowsInSourceNotInSnapshot: rec.itemsInSourceNotInSnapshot.length,
    sellInSourceNotInSnapshot: format(rec.sellInSourceNotInSnapshot),
    costInSourceNotInSnapshot: format(rec.costInSourceNotInSnapshot),
  });
}

// --- Benchmark diagnostic (why benchmarks may be zero) ---

export type BenchmarkDiagnostic = {
  projectsTotal: number;
  projectsWithIncludeInPricing: number;
  snapshotCount: number;
  snapshotsWithFlooringSf: number;
  benchmarkCount: number;
  /** Distinct room names in snapshots (normalized room mappings). */
  snapshotRoomNames: string[];
  /** Exact reason benchmarks are not generating (or null if they are). */
  exactReasonBenchmarksZero: string | null;
  reasons: string[];
};

export async function getBenchmarkDiagnostic(): Promise<BenchmarkDiagnostic> {
  await requireAdmin();

  const projects = await prismaAny.pricingImportProject.findMany({
    select: { id: true, includeInPricing: true },
  });
  const projectsWithIncludeInPricing = projects.filter(
    (p: any) => p.includeInPricing,
  ).length;

  const snapshots = await prismaAny.pricingRoomSnapshot.findMany({
    select: { roomName: true, flooringSf: true, sellPerSf: true, costPerSf: true },
  });
  const snapshotsWithFlooringSf = snapshots.filter(
    (s: any) => s.flooringSf > 0,
  ).length;
  const snapshotRoomNames = [
    ...new Set(snapshots.map((s: any) => s.roomName)),
  ].sort() as string[];

  const benchmarkCount = await prismaAny.pricingRoomBenchmark.count();

  const reasons: string[] = [];
  let exactReasonBenchmarksZero: string | null = null;

  if (benchmarkCount > 0) {
    exactReasonBenchmarksZero = null;
    reasons.push('Benchmarks are generating; no action needed.');
  } else if (projectsWithIncludeInPricing === 0) {
    exactReasonBenchmarksZero =
      'No projects have includeInPricing=true. Snapshots and benchmarks are built only from projects with includeInPricing enabled. Enable at least one project on the JobTread Pricing or Sources page.';
    reasons.push(exactReasonBenchmarksZero);
  } else if (snapshots.length === 0) {
    exactReasonBenchmarksZero =
      'Snapshots were not created. Run a JobTread sync after enabling includeInPricing for at least one project; snapshots are written only for included projects.';
    reasons.push(exactReasonBenchmarksZero);
  } else if (snapshotsWithFlooringSf === 0) {
    exactReasonBenchmarksZero =
      'Benchmark generation is skipped due to flooring / $/SF requirements: no snapshot has flooringSf > 0. Benchmarks are computed only from rooms that have a "Floor" cost group and at least one flooring-install line item (e.g. "Flooring Install", "Tile Install"). Normalized room mappings are present (' +
      snapshotRoomNames.length +
      ' rooms), but without valid flooring SF those rooms are excluded from $/SF benchmarks.';
    reasons.push(exactReasonBenchmarksZero);
  } else {
    exactReasonBenchmarksZero =
      'Snapshots with flooring SF exist (' +
      snapshotsWithFlooringSf +
      ') but no benchmarks were written. Possible causes: computeBenchmarksFromSnapshots filters by canonical room name, finite sellPerSf/costPerSf, and includedInBenchmark=true; or no snapshot passed all filters.';
    reasons.push(exactReasonBenchmarksZero);
  }

  return {
    projectsTotal: projects.length,
    projectsWithIncludeInPricing,
    snapshotCount: snapshots.length,
    snapshotsWithFlooringSf,
    benchmarkCount,
    snapshotRoomNames,
    exactReasonBenchmarksZero,
    reasons,
  };
}

/**
 * STEP 5 — Targeted reset for a single JobTread job.
 *
 * Delete only rows related to:
 * - PricingImportItem
 * - PricingImportGroup
 * - PricingRoomSnapshot
 *
 * for the specified jobId. Other jobs are not touched.
 */
export async function resetPricingImportForJob(jobId: string): Promise<void> {
  await requireAdmin();

  await prisma.$transaction(async (tx) => {
    const txAny = tx as any;

    const project = await txAny.pricingImportProject.findUnique({
      where: { jobId },
      select: { id: true },
    });
    if (!project) {
      return;
    }

    await txAny.pricingImportItem.deleteMany({
      where: { projectId: project.id },
    });

    await txAny.pricingImportGroup.deleteMany({
      where: { projectId: project.id },
    });

    await txAny.pricingRoomSnapshot.deleteMany({
      where: { jobId },
    });
  });

  revalidatePath('/admin/settings/jobtread-pricing/sources');
  revalidatePath('/admin/settings/jobtread-pricing');
}

export async function getPricingImportReconciliationForJob(
  jobId: string,
): Promise<PricingImportReconciliation | null> {
  await requireAdmin();

  const project = await prismaAny.pricingImportProject.findUnique({
    where: { jobId },
    include: {
      groups: true,
      items: true,
    },
  });

  if (!project) return null;

  const groupsById = new Map(project.groups.map((g: any) => [g.id, g]));

  const rows: PricingImportReconciliationRow[] = project.items.map(
    (item: any) => {
    const group = item.groupId ? groupsById.get(item.groupId) ?? null : null;
    const quantity = item.quantity ?? 0;
    const unitPrice = item.unitPrice ?? 0;
    const unitCost = item.unitCost ?? 0;
    const extendedSell = quantity * unitPrice;
    const extendedCost = quantity * unitCost;

    return {
      id: item.id,
      jobtreadItemId: item.jobtreadItemId,
      name: item.name,
      groupId: item.groupId,
      groupName: (group as any)?.name ?? null,
      quantity,
      unitPrice,
      unitCost,
      extendedSell,
      extendedCost,
      includeInPricing: item.includeInPricing,
      normalizedPricingGroup: (group as any)?.normalizedPricingGroup ?? null,
      groupKind: (group as any)?.groupKind ?? null,
    };
  });

  const appSellTotalIncluded = rows
    .filter((r) => r.includeInPricing)
    .reduce((sum, r) => sum + r.extendedSell, 0);
  const appCostTotalIncluded = rows
    .filter((r) => r.includeInPricing)
    .reduce((sum, r) => sum + r.extendedCost, 0);

  const appSellTotalAll = rows.reduce((sum, r) => sum + r.extendedSell, 0);
  const appCostTotalAll = rows.reduce((sum, r) => sum + r.extendedCost, 0);

  // JobTread budget totals from DataX (jobtread_get_job_budget) for 125 South Shore #1302.
  const expectedSellTotal = 865_121.4959172342;
  const expectedCostTotal = 532_318.7892911092;

  const sellVarianceIncluded = appSellTotalIncluded - expectedSellTotal;
  const costVarianceIncluded = appCostTotalIncluded - expectedCostTotal;

  const seen = new Set<string>();
  const duplicateJobtreadItemIds: string[] = [];
  for (const row of rows) {
    if (seen.has(row.jobtreadItemId)) {
      duplicateJobtreadItemIds.push(row.jobtreadItemId);
    } else {
      seen.add(row.jobtreadItemId);
    }
  }

  // Biggest contributors to overage: included items sorted by extendedSell descending.
  const topOverageContributors = rows
    .filter((r) => r.includeInPricing)
    .slice()
    .sort((a, b) => b.extendedSell - a.extendedSell)
    .slice(0, 25);

  return {
    jobId: project.jobId,
    jobName: project.jobName,
    expectedSellTotal,
    expectedCostTotal,
    appSellTotalIncluded,
    appCostTotalIncluded,
    appSellTotalAll,
    appCostTotalAll,
    sellVarianceIncluded,
    costVarianceIncluded,
    rows,
    duplicateJobtreadItemIds,
    topOverageContributors,
  };
}

export async function getDuplicateScopeAnalysisForJob(
  jobId: string,
): Promise<DuplicateScopeAnalysis | null> {
  await requireAdmin();

  const project = await prismaAny.pricingImportProject.findUnique({
    where: { jobId },
    include: {
      groups: true,
      items: true,
    },
  });

  if (!project) return null;

  const groups = project.groups;
  const groupsById = new Map(groups.map((g: any) => [g.id, g]));
  const groupsByJobtreadId = new Map(
    groups.map((g: any) => [g.jobtreadGroupId, g]),
  );

  function normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function getGroupPathAndRoom(group: (typeof groups)[number]): {
    groupPath: string;
    roomKey: string | null;
  } {
    const segs: string[] = [];
    let roomKey: string | null = null;
    const visited = new Set<string>();
    let cursor: (typeof groups)[number] | undefined = group;

    while (cursor && !visited.has(cursor.id)) {
      segs.push(cursor.name);
      if (!roomKey && cursor.normalizedPricingGroup) {
        roomKey = cursor.normalizedPricingGroup;
      }
      visited.add(cursor.id);
      const parentJtId = cursor.parentJobtreadGroupId;
      if (!parentJtId) break;
      cursor = groupsByJobtreadId.get(parentJtId);
    }

    segs.reverse();
    const groupPath = segs.length > 0 ? segs.join(' > ') : '(ungrouped)';
    return { groupPath, roomKey };
  }

  type CoreKeyBucket = {
    normalizedName: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    paths: Map<string, RepeatedItemPath>;
  };

  const byCoreKey = new Map<string, CoreKeyBucket>();
  let itemsWithNoRoomOrGroupPath = 0;

  for (const item of project.items) {
    const group = item.groupId ? groupsById.get(item.groupId) ?? null : null;
    const quantity = item.quantity ?? 0;
    const unitPrice = item.unitPrice ?? 0;
    const unitCost = item.unitCost ?? 0;
    const extendedSell = quantity * unitPrice;
    const extendedCost = quantity * unitCost;

    const baseRow: PricingImportReconciliationRow = {
      id: item.id,
      jobtreadItemId: item.jobtreadItemId,
      name: item.name,
      groupId: item.groupId,
      groupName: (group as any)?.name ?? null,
      quantity,
      unitPrice,
      unitCost,
      extendedSell,
      extendedCost,
      includeInPricing: item.includeInPricing,
      normalizedPricingGroup: (group as any)?.normalizedPricingGroup ?? null,
      groupKind: (group as any)?.groupKind ?? null,
    };

    const normalizedItemName = normalizeName(item.name);
    const coreKey = [
      normalizedItemName,
      quantity.toFixed(4),
      unitPrice.toFixed(4),
      unitCost.toFixed(4),
    ].join('|');

    let groupPath = '(ungrouped)';
    let roomKey: string | null = null;
    if (group) {
      const info = getGroupPathAndRoom(group);
      groupPath = info.groupPath;
      roomKey = info.roomKey;
    }

    if (!group && !roomKey) {
      itemsWithNoRoomOrGroupPath += 1;
    }

    const pathKey = `${roomKey ?? '(no-room)'} | ${groupPath}`;

    const bucket =
      byCoreKey.get(coreKey) ??
      {
        normalizedName: normalizedItemName,
        quantity,
        unitPrice,
        unitCost,
        paths: new Map<string, RepeatedItemPath>(),
      };
    byCoreKey.set(coreKey, bucket);

    const existingPath =
      bucket.paths.get(pathKey) ??
      {
        pathKey,
        roomKey,
        groupPath,
        hasRoom: roomKey != null,
        items: [],
        pathSellTotal: 0,
        pathCostTotal: 0,
      };

    const enriched = {
      ...baseRow,
      projectCreatedAt: project.createdAt,
      projectUpdatedAt: project.updatedAt,
      groupJobtreadId: (group as any)?.jobtreadGroupId ?? null,
      groupCreatedAt: (group as any)?.createdAt ?? null,
      groupUpdatedAt: (group as any)?.updatedAt ?? null,
      itemCreatedAt: item.createdAt,
      itemUpdatedAt: item.updatedAt,
    };

    existingPath.items.push(enriched);
    existingPath.pathSellTotal += extendedSell;
    existingPath.pathCostTotal += extendedCost;
    bucket.paths.set(pathKey, existingPath);
  }

  const suspiciousSets: SuspiciousRepeatSet[] = [];
  const crossRoomSets: CrossRoomRepeatSet[] = [];
  let suspiciousSellSubtotal = 0;
  let suspiciousCostSubtotal = 0;

  for (const [coreKey, bucket] of byCoreKey.entries()) {
    const pathsArray = Array.from(bucket.paths.values());
    if (pathsArray.length === 0) continue;

    const hasMultiplePaths = pathsArray.length > 1;
    const suspiciousPaths = pathsArray.filter((p) => p.items.length > 1);

    if (hasMultiplePaths) {
      crossRoomSets.push({
        coreKey,
        normalizedName: bucket.normalizedName,
        quantity: bucket.quantity,
        unitPrice: bucket.unitPrice,
        unitCost: bucket.unitCost,
        paths: pathsArray,
      });
    }

    if (suspiciousPaths.length > 0) {
      const suspiciousSellTotal = suspiciousPaths.reduce(
        (sum, p) => sum + p.pathSellTotal,
        0,
      );
      const suspiciousCostTotal = suspiciousPaths.reduce(
        (sum, p) => sum + p.pathCostTotal,
        0,
      );
      suspiciousSellSubtotal += suspiciousSellTotal;
      suspiciousCostSubtotal += suspiciousCostTotal;

      suspiciousSets.push({
        coreKey,
        normalizedName: bucket.normalizedName,
        quantity: bucket.quantity,
        unitPrice: bucket.unitPrice,
        unitCost: bucket.unitCost,
        suspiciousPaths,
        suspiciousSellTotal,
        suspiciousCostTotal,
      });
    }
  }

  suspiciousSets.sort((a, b) => b.suspiciousSellTotal - a.suspiciousSellTotal);
  crossRoomSets.sort((a, b) => {
    const aTotal = a.paths.reduce((sum, p) => sum + p.pathSellTotal, 0);
    const bTotal = b.paths.reduce((sum, p) => sum + p.pathSellTotal, 0);
    return bTotal - aTotal;
  });

  return {
    jobId: project.jobId,
    jobName: project.jobName,
    suspiciousSets,
    crossRoomSets,
    suspiciousSellSubtotal,
    suspiciousCostSubtotal,
    itemsWithNoRoomOrGroupPath,
  };
}

// TEMP DEBUG TOOL — remove after budget membership reconciliation is complete.
export async function runBudgetTextDiffForJobAction(
  jobId: string,
  budgetText: string,
): Promise<void> {
  await requireAdmin();
  await runBudgetTextDiffForJob();
}

export async function setProjectIncludeInPricing(projectId: string, include: boolean) {
  await requireAdmin();

  await prisma.$transaction(async (tx) => {
    const txAny = tx as any;

    await txAny.pricingImportProject.update({
      where: { id: projectId },
      data: { includeInPricing: include },
    });

    await txAny.pricingImportGroup.updateMany({
      where: { projectId },
      data: { includeInPricing: include },
    });

    await txAny.pricingImportItem.updateMany({
      where: { projectId },
      data: { includeInPricing: include },
    });
  });

  revalidatePath('/admin/settings/jobtread-pricing/sources');
  revalidatePath('/admin/settings/jobtread-pricing');
}

export async function setGroupIncludeInPricing(groupId: string, include: boolean) {
  await requireAdmin();

  const group = await prismaAny.pricingImportGroup.findUnique({
    where: { id: groupId },
  });
  if (!group) return;

  // Fetch all groups in this project to compute descendants in application code.
  const allGroups = await prismaAny.pricingImportGroup.findMany({
    where: { projectId: group.projectId },
  });

  const childrenByParentJobtreadId = new Map<string | null, typeof allGroups>();
  for (const g of allGroups) {
    const key = g.parentJobtreadGroupId ?? null;
    const list = childrenByParentJobtreadId.get(key) ?? [];
    list.push(g);
    childrenByParentJobtreadId.set(key, list);
  }

  const targetIds = new Set<string>();
  const stack: typeof allGroups = [group];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (targetIds.has(current.id)) continue;
    targetIds.add(current.id);
    const kids =
      childrenByParentJobtreadId.get(current.jobtreadGroupId) ?? [];
    for (const child of kids) stack.push(child);
  }

  await prisma.$transaction(async (tx) => {
    const txAny = tx as any;

    await txAny.pricingImportGroup.updateMany({
      where: { id: { in: Array.from(targetIds) } },
      data: { includeInPricing: include },
    });

    await txAny.pricingImportItem.updateMany({
      where: { groupId: { in: Array.from(targetIds) } },
      data: { includeInPricing: include },
    });
  });

  revalidatePath('/admin/settings/jobtread-pricing/sources');
  revalidatePath('/admin/settings/jobtread-pricing');
}

export async function setItemIncludeInPricing(itemId: string, include: boolean) {
  await requireAdmin();

  await prismaAny.pricingImportItem.update({
    where: { id: itemId },
    data: { includeInPricing: include },
  });

  revalidatePath('/admin/settings/jobtread-pricing/sources');
  revalidatePath('/admin/settings/jobtread-pricing');
}

export async function setGroupBenchmarkOverride(
  groupId: string,
  benchmarkGroupOverride: string | null,
) {
  await requireAdmin();

  await prismaAny.pricingImportGroup.update({
    where: { id: groupId },
    data: { benchmarkGroupOverride },
  });

  revalidatePath('/admin/settings/jobtread-pricing/sources');
  revalidatePath('/admin/settings/jobtread-pricing');
}


