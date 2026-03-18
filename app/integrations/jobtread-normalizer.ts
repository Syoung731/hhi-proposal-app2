export type JobTreadJob = {
  id: string;
  name: string;
  costGroups: {
    id?: unknown;
    name?: unknown;
  }[];
  costItems: {
    id?: unknown;
    name?: unknown;
    quantity?: unknown;
    unitPrice?: unknown;
    unitCost?: unknown;
    costGroup?: {
      id?: unknown;
    } | null;
  }[];
};

export type NormalizedCostItem = {
  jobId: string;
  jobName: string;
  groupId: string;
  groupName: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  sellTotal: number;
  costTotal: number;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function normalizeJobTreadItems(job: JobTreadJob): NormalizedCostItem[] {
  const { id: jobId, name: jobName } = job;
  const groupsById = new Map<string, { id: string; name: string }>();

  for (const rawGroup of job.costGroups) {
    const id = String(rawGroup.id ?? '').trim();
    const name = String(rawGroup.name ?? '').trim();
    if (!id || !name) continue;
    groupsById.set(id, { id, name });
  }

  const rawItems = job.costItems ?? [];
  const rawCount = rawItems.length;

  const normalized: NormalizedCostItem[] = [];

  for (const rawItem of rawItems) {
    const itemId = String(rawItem.id ?? '').trim();
    const itemName = String(rawItem.name ?? '').trim();
    if (!itemId || !itemName) continue;

    const quantity = toNumber(rawItem.quantity);
    const unitPrice = toNumber(rawItem.unitPrice);
    const unitCost = toNumber(rawItem.unitCost);
    const sellTotal = quantity * unitPrice;
    const costTotal = quantity * unitCost;

    const groupRef = rawItem.costGroup ?? null;
    const groupIdRaw = groupRef?.id;
    const groupId = typeof groupIdRaw === 'string' && groupIdRaw.trim() ? groupIdRaw.trim() : '';
    const group =
      (groupId && groupsById.get(groupId)) ??
      (groupId
        ? { id: groupId, name: '(unknown group)' }
        : { id: '(ungrouped)', name: '(ungrouped)' });

    normalized.push({
      jobId,
      jobName,
      groupId: (group as any).id,
      groupName: (group as any).name,
      itemId,
      itemName,
      quantity,
      unitPrice,
      unitCost,
      sellTotal,
      costTotal,
    });
  }

  const deduped = new Map<string, NormalizedCostItem>();
  for (const row of normalized) {
    if (!deduped.has(row.itemId)) {
      deduped.set(row.itemId, row);
    }
  }

  const dedupedValues = Array.from(deduped.values());

  const format = (n: number) =>
    Number.isFinite(n)
      ? n.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '—';

  // eslint-disable-next-line no-console
  console.log('[JobTread normalization] Raw items:', rawCount);
  // eslint-disable-next-line no-console
  console.log('[JobTread normalization] Normalized items:', normalized.length);
  // eslint-disable-next-line no-console
  console.log('[JobTread normalization] Deduped items:', dedupedValues.length);

  const sample = dedupedValues.slice(0, 10).map((row) => ({
    ...row,
    quantity: format(row.quantity),
    unitPrice: format(row.unitPrice),
    unitCost: format(row.unitCost),
    sellTotal: format(row.sellTotal),
    costTotal: format(row.costTotal),
  }));

  // eslint-disable-next-line no-console
  console.log('[JobTread normalization] First 10 rows:', sample);

  return dedupedValues;
}

