/**
 * Recompute InvestmentLineItem rollups per bucket from Section (Room) totals.
 * Call after create/update/delete of sections or AI rewrite.
 */

import type { SectionBucket } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";

const BUCKET_ORDER: SectionBucket[] = ["BASE", "ALTERNATE", "ALLOWANCE"];
const BUCKET_LABELS: Record<SectionBucket, string> = {
  BASE: "Base",
  ALTERNATE: "Alternates",
  ALLOWANCE: "Allowances",
};

export async function recomputeInvestmentRollups(projectId: string): Promise<void> {
  const rooms = await prisma.room.findMany({
    where: { projectId },
    select: {
      bucket: true,
      totalLow: true,
      totalTarget: true,
      totalHigh: true,
    },
  });

  const sums = new Map<
    SectionBucket,
    { rangeLow: number; rangeTarget: number; rangeHigh: number }
  >();
  for (const b of BUCKET_ORDER) {
    sums.set(b, { rangeLow: 0, rangeTarget: 0, rangeHigh: 0 });
  }
  for (const r of rooms) {
    const cur = sums.get(r.bucket)!;
    cur.rangeLow += r.totalLow ?? 0;
    cur.rangeTarget += r.totalTarget ?? 0;
    cur.rangeHigh += r.totalHigh ?? 0;
  }

  for (let i = 0; i < BUCKET_ORDER.length; i++) {
    const bucket = BUCKET_ORDER[i]!;
    const s = sums.get(bucket)!;
    const rangeLow = Math.round(s.rangeLow);
    const rangeTarget = Math.round(s.rangeTarget);
    const rangeHigh = Math.round(s.rangeHigh);
    await prisma.investmentLineItem.upsert({
      where: {
        projectId_bucket: { projectId, bucket },
      },
      create: {
        projectId,
        bucket,
        label: BUCKET_LABELS[bucket],
        rangeLow,
        rangeTarget,
        rangeHigh,
        sortOrder: i,
      },
      update: {
        rangeLow,
        rangeTarget,
        rangeHigh,
        label: BUCKET_LABELS[bucket],
        sortOrder: i,
      },
    });
  }
}
