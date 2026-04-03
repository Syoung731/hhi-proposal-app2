/**
 * Recompute InvestmentLineItem rollups per bucket from the active pricing tier.
 *
 * Each room has a `pricingTier` field: PROFILE | AI_ESTIMATE | MANUAL.
 * The rollup reads from whichever tier is active:
 *   - PROFILE:     SectionType rates × dimensions (computeRoomPriceRange)
 *   - AI_ESTIMATE: Sum of latest AIEstimate line items
 *   - MANUAL:      Room.totalLow / totalTarget / totalHigh as-is
 *
 * Only the PROFILE path backfills Room.totalLow / totalTarget / totalHigh.
 */

import type { SectionBucket } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";
import { computeRoomPriceRange } from "@/app/lib/room-price-range";

const BUCKET_ORDER: SectionBucket[] = ["BASE", "ALTERNATE", "ALLOWANCE"];
const BUCKET_LABELS: Record<SectionBucket, string> = {
  BASE: "Base",
  ALTERNATE: "Alternates",
  ALLOWANCE: "Allowances",
};

const DEFAULT_LOW_PCT = -10;
const DEFAULT_HIGH_PCT = 10;

// ── Dedup guard: collapse concurrent rollup calls for the same project ──
const inflightRollups = new Map<string, Promise<void>>();

export async function recomputeInvestmentRollups(projectId: string): Promise<void> {
  const existing = inflightRollups.get(projectId);
  if (existing) return existing;                // piggyback on in-flight call

  const promise = _recomputeInvestmentRollups(projectId).finally(() => {
    inflightRollups.delete(projectId);
  });
  inflightRollups.set(projectId, promise);
  return promise;
}

async function _recomputeInvestmentRollups(projectId: string): Promise<void> {
  // ── 1. Fetch company-level low/high pct overrides ─────────────────────────
  const [settings, context] = await Promise.all([
    prisma.companySettings.findFirst({
      select: { roomTypeLowPct: true, roomTypeHighPct: true },
    }),
    prisma.companyContext.findFirst({
      select: { priceRangeLowPct: true, priceRangeHighPct: true },
    }),
  ]);
  const lowPct = settings?.roomTypeLowPct ?? DEFAULT_LOW_PCT;
  const highPct = settings?.roomTypeHighPct ?? DEFAULT_HIGH_PCT;
  const aiLowPct = context?.priceRangeLowPct ?? DEFAULT_LOW_PCT;
  const aiHighPct = context?.priceRangeHighPct ?? DEFAULT_HIGH_PCT;

  // ── 2. Fetch rooms with pricing tier, SectionType rates, sub-areas ────────
  const rooms = await prisma.room.findMany({
    where: { projectId },
    select: {
      id: true,
      bucket: true,
      pricingTier: true,
      isProjectOverhead: true,
      areaSqFt: true,
      quantity: true,
      unitQuantity: true,
      totalLow: true,
      totalTarget: true,
      totalHigh: true,
      subAreas: {
        select: { areaSqFt: true, includeInArea: true },
      },
      sectionType: {
        select: {
          pricingBasis: true,
          priceTarget: true,
          priceLow: true,
          priceHigh: true,
        },
      },
    },
  });

  // ── 3. Batch-fetch AI estimates for rooms using AI_ESTIMATE tier ──────────
  const aiRoomIds = rooms.filter((r) => r.pricingTier === "AI_ESTIMATE").map((r) => r.id);
  const aiEstimateMap = new Map<string, { totalPrice: number; rangeLow: number; rangeHigh: number }>();

  if (aiRoomIds.length > 0) {
    // Get the latest estimate per room
    const estimates = await prisma.aIEstimate.findMany({
      where: { sectionId: { in: aiRoomIds } },
      orderBy: { createdAt: "desc" },
      select: {
        sectionId: true,
        totalPrice: true,
        lineItems: {
          select: { totalPrice: true, totalPriceLow: true, totalPriceHigh: true },
        },
      },
    });

    // Keep only the latest per sectionId
    for (const est of estimates) {
      if (aiEstimateMap.has(est.sectionId)) continue;
      let rangeLow = est.lineItems.reduce((s, li) => s + (li.totalPriceLow ?? 0), 0);
      let rangeHigh = est.lineItems.reduce((s, li) => s + (li.totalPriceHigh ?? 0), 0);
      const total = est.totalPrice ?? 0;
      // Fallback if stored ranges are zero (legacy data)
      if ((rangeLow <= 0 || rangeHigh <= 0 || rangeLow === rangeHigh) && total > 0) {
        rangeLow = Math.round(total * (1 + aiLowPct / 100));
        rangeHigh = Math.round(total * (1 + aiHighPct / 100));
      }
      aiEstimateMap.set(est.sectionId, { totalPrice: total, rangeLow, rangeHigh });
    }
  }

  // ── 4. Compute live ranges per room based on active tier ───────────────────
  const sums = new Map<
    SectionBucket,
    { rangeLow: number; rangeTarget: number; rangeHigh: number }
  >();
  for (const b of BUCKET_ORDER) {
    sums.set(b, { rangeLow: 0, rangeTarget: 0, rangeHigh: 0 });
  }

  // Track COPE room totals separately for a dedicated line item
  let copeTotals: { rangeLow: number; rangeTarget: number; rangeHigh: number } | null = null;

  const backfills: Array<{
    id: string;
    totalLow: number;
    totalTarget: number;
    totalHigh: number;
  }> = [];

  for (const room of rooms) {
    const tier = room.pricingTier ?? "PROFILE";
    let rangeLow = 0;
    let rangeTarget = 0;
    let rangeHigh = 0;

    if (tier === "PROFILE") {
      // ── PROFILE: existing SectionType × dimensions logic ──
      const st = room.sectionType;
      if (!st) continue;
      const range = computeRoomPriceRange(room, st, lowPct, highPct);
      if (!range) continue;
      rangeLow = range.rangeLow;
      rangeHigh = range.rangeHigh;
      rangeTarget = room.totalTarget ?? Math.round((rangeLow + rangeHigh) / 2);
    } else if (tier === "AI_ESTIMATE") {
      // ── AI_ESTIMATE: sum line items from latest estimate ──
      const ai = aiEstimateMap.get(room.id);
      if (!ai) continue; // no estimate — skip
      rangeLow = ai.rangeLow;
      rangeHigh = ai.rangeHigh;
      rangeTarget = ai.totalPrice;
    } else if (tier === "MANUAL") {
      // ── MANUAL: read room's stored totals as-is, don't overwrite ──
      if (room.totalLow == null && room.totalTarget == null && room.totalHigh == null) continue;
      rangeLow = room.totalLow ?? room.totalTarget ?? room.totalHigh ?? 0;
      rangeTarget = room.totalTarget ?? Math.round(((room.totalLow ?? 0) + (room.totalHigh ?? 0)) / 2);
      rangeHigh = room.totalHigh ?? room.totalTarget ?? room.totalLow ?? 0;
    }

    // COPE rooms go into their own line item, not the bucket sums
    if (room.isProjectOverhead) {
      copeTotals = { rangeLow, rangeTarget, rangeHigh };
    } else {
      const cur = sums.get(room.bucket)!;
      cur.rangeLow += rangeLow;
      cur.rangeTarget += rangeTarget;
      cur.rangeHigh += rangeHigh;
    }

    // Backfill Room.totalLow/Target/High so the Investment tab sections table
    // always shows the active tier's values. Skip MANUAL since user set those.
    if (tier !== "MANUAL") {
      backfills.push({ id: room.id, totalLow: rangeLow, totalTarget: rangeTarget, totalHigh: rangeHigh });
    }
  }

  // ── 5. Backfill Room totals + upsert InvestmentLineItems ──────────────────
  // Use a batched transaction (array of promises) to minimize round-trips
  // and avoid the interactive transaction timeout/deadlock issues with
  // remote Neon Postgres connections.

  const ops = [];

  // Backfill stale Room.totalLow / totalTarget / totalHigh (PROFILE / AI_ESTIMATE)
  for (const bf of backfills) {
    ops.push(
      prisma.room.update({
        where: { id: bf.id },
        data: {
          totalLow: bf.totalLow,
          totalTarget: bf.totalTarget,
          totalHigh: bf.totalHigh,
        },
      })
    );
  }

  // Upsert one InvestmentLineItem per bucket
  for (let i = 0; i < BUCKET_ORDER.length; i++) {
    const bucket = BUCKET_ORDER[i]!;
    const s = sums.get(bucket)!;

    // Add COPE totals into the BASE bucket (COPE is always BASE)
    if (bucket === "BASE" && copeTotals) {
      s.rangeLow += copeTotals.rangeLow;
      s.rangeTarget += copeTotals.rangeTarget;
      s.rangeHigh += copeTotals.rangeHigh;
    }

    const rl = Math.round(s.rangeLow);
    const rt = Math.round(s.rangeTarget);
    const rh = Math.round(s.rangeHigh);

    ops.push(
      prisma.investmentLineItem.upsert({
        where: { projectId_bucket: { projectId, bucket } },
        create: {
          projectId,
          bucket,
          label: BUCKET_LABELS[bucket],
          rangeLow: rl,
          rangeTarget: rt,
          rangeHigh: rh,
          sortOrder: i,
        },
        update: {
          rangeLow: rl,
          rangeTarget: rt,
          rangeHigh: rh,
          label: BUCKET_LABELS[bucket],
          sortOrder: i,
        },
      })
    );
  }

  // Execute all writes as a batched transaction (single round-trip).
  // Retry on deadlock (Neon/Postgres error P2034) up to 3 times with backoff.
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await prisma.$transaction(ops);
      return;
    } catch (err: unknown) {
      const isDeadlock =
        err instanceof Error &&
        (err.message.includes("deadlock") ||
         err.message.includes("could not serialize") ||
         err.message.includes("P2034"));
      const isTimeout =
        err instanceof Error &&
        (err.message.includes("expired transaction") ||
         err.message.includes("Transaction already closed"));

      if ((isDeadlock || isTimeout) && attempt < MAX_RETRIES) {
        // Exponential backoff: 200ms, 400ms
        await new Promise((r) => setTimeout(r, 200 * attempt));
        continue;
      }
      throw err;
    }
  }
}
