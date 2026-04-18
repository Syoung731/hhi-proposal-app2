import { prisma } from "@/app/lib/prisma";
import { getEffectiveProjectSF } from "@/app/lib/effective-room-sf";
import { calculatePermitFee, type PermitFeeResult } from "@/app/lib/permit-fee-calculator";

export async function getProjectAggregateData(
  projectId: string,
  projectDefaultCeilingFt?: number | null,
) {
  // 1. Get all NON-COPE rooms
  const rooms = await prisma.room.findMany({
    where: { projectId, isProjectOverhead: false },
    select: {
      id: true,
      name: true,
      areaSqFt: true,
      totalLow: true,
      totalTarget: true,
      totalHigh: true,
      pricingTier: true,
      sectionType: { select: { name: true } },
    },
  });

  // 2. Get latest AI estimate per room (most recent by createdAt)
  const estimateData = [];
  for (const room of rooms) {
    const estimate = await prisma.aIEstimate.findFirst({
      where: { sectionId: room.id, projectId },
      orderBy: { createdAt: "desc" },
      include: { lineItems: true },
    });
    if (estimate) {
      estimateData.push({ room, estimate });
    }
  }

  // 3. Aggregate line items across all estimates
  const allLineItems = estimateData.flatMap((e) => e.estimate.lineItems);

  // 4. Trade group breakdown
  const tradeBreakdown: Record<string, { count: number; totalPrice: number; totalCost: number }> =
    {};
  for (const item of allLineItems) {
    const trade = item.tradeGroup || "Other";
    if (!tradeBreakdown[trade]) {
      tradeBreakdown[trade] = { count: 0, totalPrice: 0, totalCost: 0 };
    }
    tradeBreakdown[trade].count++;
    tradeBreakdown[trade].totalPrice += item.totalPrice || 0;
    tradeBreakdown[trade].totalCost += item.totalCost || 0;
  }

  // 5. Calculate totals
  const totalEstimatedPrice = estimateData.reduce(
    (sum, e) => sum + (e.estimate.totalPrice || 0),
    0,
  );
  const totalEstimatedCost = estimateData.reduce(
    (sum, e) => sum + (e.estimate.totalCost || 0),
    0,
  );

  // Use effective SF (includes sub-areas) instead of raw areaSqFt sum
  const { totalEffectiveSqFt, roomMetrics } = await getEffectiveProjectSF(
    projectId,
    projectDefaultCeilingFt,
  );
  const totalAreaSqFt = totalEffectiveSqFt;

  // 6. Scope characteristic flags
  const hasFraming = "Framing" in tradeBreakdown;
  const hasPlumbing = "Plumbing" in tradeBreakdown;
  const hasElectrical = "Electrical" in tradeBreakdown;
  const hasWindows =
    "Windows" in tradeBreakdown ||
    allLineItems.some(
      (i) =>
        i.name.toLowerCase().includes("window") ||
        i.name.toLowerCase().includes("exterior door"),
    );
  const demoTotal = tradeBreakdown["Demo"]?.totalPrice || 0;
  const distinctTrades = Object.keys(tradeBreakdown).length;

  // 7. Pre-calculate permit fees (never let the AI do this arithmetic)
  const permitFees = calculatePermitFee(totalEstimatedPrice, {
    hasFraming,
    hasPlumbing,
    hasWindows,
  });

  return {
    rooms: rooms.map((r) => ({
      name: r.name,
      areaSqFt: r.areaSqFt,
      effectiveSqFt: roomMetrics.get(r.id)?.effectiveSqFt ?? r.areaSqFt ?? 0,
      wallSF: roomMetrics.get(r.id)?.wallSF ?? null,
      totalTarget: r.totalTarget,
      sectionType: r.sectionType?.name || null,
    })),
    totalEstimatedPrice,
    totalEstimatedCost,
    totalAreaSqFt,
    roomCount: rooms.length,
    roomsWithEstimates: estimateData.length,
    tradeBreakdown,
    demoTotal,
    hasFraming,
    hasPlumbing,
    hasElectrical,
    hasWindows,
    distinctTrades,
    permitFees,
  };
}

export type ProjectAggregateData = Awaited<ReturnType<typeof getProjectAggregateData>>;
