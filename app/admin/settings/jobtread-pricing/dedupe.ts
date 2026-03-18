/**
 * Path-aware duplicate collapse for JobTread pricing.
 *
 * Root cause: JobTread API sometimes returns two distinct cost items (different ids)
 * for the same visible scope line (same name, qty, unit price/cost, path). Both are
 * imported; we do not alter raw DB rows. This helper is used only during rollup,
 * snapshot, and benchmark calculations so totals count each logical line once.
 */

export type DedupeMetrics = {
  rowsRemoved: number;
  sellRemoved: number;
  costRemoved: number;
};

/** Item shape required for dedupe key and metrics. Must include jobtreadItemId for deterministic keep. */
export type DedupeContextItem = {
  id: string;
  jobtreadItemId: string;
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  unitCost: number | null;
  includeInPricing: boolean;
  roomKey: string | null;
  groupPath: string;
};

type GroupWithPath = {
  jobtreadGroupId: string;
  parentJobtreadGroupId: string | null;
  name: string;
  normalizedPricingGroup: string | null;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Build dedupe key: same key => same logical line (we keep one per key).
 * Includes path so we never collapse across different rooms/groups.
 */
function dedupeKey(item: DedupeContextItem): string {
  const qty = item.quantity ?? 0;
  const up = item.unitPrice ?? 0;
  const uc = item.unitCost ?? 0;
  return [
    normalizeName(item.name),
    item.roomKey ?? '(no-room)',
    item.groupPath,
    qty.toFixed(4),
    up.toFixed(4),
    uc.toFixed(4),
    item.includeInPricing ? '1' : '0',
  ].join('|');
}

/**
 * Path-aware duplicate collapse. For each group of items that share the same
 * (name, path, qty, unit price, unit cost, includeInPricing), keeps one row
 * deterministically (smallest jobtreadItemId). Zero-quantity rows are not
 * counted in removed sell/cost.
 */
export function dedupePricingItems<T extends DedupeContextItem>(
  items: T[],
): { items: T[]; metrics: DedupeMetrics } {
  const byKey = new Map<string, T[]>();

  for (const item of items) {
    const key = dedupeKey(item);
    const bucket = byKey.get(key) ?? [];
    bucket.push(item);
    byKey.set(key, bucket);
  }

  const metrics: DedupeMetrics = { rowsRemoved: 0, sellRemoved: 0, costRemoved: 0 };
  const kept: T[] = [];

  for (const bucket of byKey.values()) {
    if (bucket.length === 1) {
      kept.push(bucket[0]);
      continue;
    }
    // Deterministic: sort by jobtreadItemId ascending, keep first.
    const sorted = [...bucket].sort((a, b) =>
      a.jobtreadItemId.localeCompare(b.jobtreadItemId),
    );
    const [first, ...dups] = sorted;
    kept.push(first);

    for (const dup of dups) {
      metrics.rowsRemoved += 1;
      if (!dup.includeInPricing) continue;
      const qty = dup.quantity ?? 0;
      if (qty === 0) continue;
      const up = dup.unitPrice ?? 0;
      const uc = dup.unitCost ?? 0;
      metrics.sellRemoved += qty * up;
      metrics.costRemoved += qty * uc;
    }
  }

  return { items: kept, metrics };
}

/**
 * Compute full group path (root to leaf) and room key (nearest normalized pricing group)
 * for a group. Used to assign roomKey/groupPath to items before dedupe.
 */
export function getGroupPathAndRoom(
  group: GroupWithPath,
  groupsByJobtreadId: Map<string, GroupWithPath>,
): { groupPath: string; roomKey: string | null } {
  const segs: string[] = [];
  let roomKey: string | null = null;
  const visited = new Set<string>();
  let cursor: GroupWithPath | undefined = group;

  while (cursor && !visited.has(cursor.jobtreadGroupId)) {
    segs.push(cursor.name);
    if (!roomKey && cursor.normalizedPricingGroup) {
      roomKey = cursor.normalizedPricingGroup;
    }
    visited.add(cursor.jobtreadGroupId);
    const parentId = cursor.parentJobtreadGroupId;
    if (!parentId) break;
    cursor = groupsByJobtreadId.get(parentId);
  }

  segs.reverse();
  const groupPath = segs.length > 0 ? segs.join(' > ') : '(ungrouped)';
  return { groupPath, roomKey };
}
