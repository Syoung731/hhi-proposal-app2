import "server-only";

import { prisma } from "@/app/lib/prisma";
import { mapWithConcurrency } from "@/app/lib/async-pool";

/**
 * Learned cost-code memory. Remembers the cost code/type chosen for a line-item
 * NAME across pushes so estimators don't re-pick the same codes every time.
 *   - `recordCostCodeMemory` upserts (org-wide, last-writer-wins) the final code
 *     for every pushed line — called from `startPushJobAction`.
 *   - `loadCostCodeMemory` returns a name → code map that `preparePush` overlays
 *     onto non-template-exact lines (matchKind "learned").
 */

export interface LearnedCostCode {
  costCodeId: string;
  costCodeName: string;
  costTypeId: string | null;
  costTypeName: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Memory key, scoped to the TRADE + item name. Trade-scoping prevents a code
 * learned for one trade (e.g. "Demo > Remove X") from silently pre-filling a
 * same-named line in a different trade.
 */
export function memoryKey(tradeName: string, name: string): string {
  return `${norm(tradeName)}::${norm(name)}`;
}

/** All remembered mappings as a `memoryKey(name)` → code map. */
export async function loadCostCodeMemory(): Promise<Map<string, LearnedCostCode>> {
  const rows = await prisma.jobTreadCostCodeMemory.findMany({
    select: {
      itemNameKey: true,
      costCodeId: true,
      costCodeName: true,
      costTypeId: true,
      costTypeName: true,
    },
  });
  return new Map(
    rows.map((r) => [
      r.itemNameKey,
      {
        costCodeId: r.costCodeId,
        costCodeName: r.costCodeName,
        costTypeId: r.costTypeId,
        costTypeName: r.costTypeName,
      },
    ]),
  );
}

export interface RecordableLine {
  tradeName: string;
  name: string;
  costCodeId: string | null;
  costCodeName: string | null;
  costTypeId: string | null;
  costTypeName: string | null;
}

/**
 * Remember the cost code/type for each pushed line (keyed by normalized name).
 * Deduped per call (last occurrence wins) so a name appearing N times in one
 * push only upserts once. Best-effort — never throws into the push flow.
 */
export async function recordCostCodeMemory(lines: RecordableLine[]): Promise<void> {
  // Dedupe by key, last-writer-wins; skip lines without a resolved cost code.
  const byKey = new Map<string, RecordableLine>();
  for (const line of lines) {
    if (!line.costCodeId || !line.costCodeName) continue;
    const key = memoryKey(line.tradeName, line.name);
    if (key) byKey.set(key, line);
  }
  const entries = [...byKey.entries()];
  if (entries.length === 0) return;

  try {
    await mapWithConcurrency(entries, 8, async ([key, line]) => {
      await prisma.jobTreadCostCodeMemory.upsert({
        where: { itemNameKey: key },
        create: {
          itemNameKey: key,
          itemName: line.name,
          costCodeId: line.costCodeId!,
          costCodeName: line.costCodeName!,
          costTypeId: line.costTypeId,
          costTypeName: line.costTypeName,
        },
        update: {
          itemName: line.name,
          costCodeId: line.costCodeId!,
          costCodeName: line.costCodeName!,
          costTypeId: line.costTypeId,
          costTypeName: line.costTypeName,
          timesSeen: { increment: 1 },
        },
      });
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[jobtread push-memory] recordCostCodeMemory failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
}
