import { prisma } from "@/app/lib/prisma";

export async function getProjectAggregateData(projectId: string) {
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
  const totalAreaSqFt = rooms.reduce((sum, r) => sum + (r.areaSqFt || 0), 0);

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

  return {
    rooms: rooms.map((r) => ({
      name: r.name,
      areaSqFt: r.areaSqFt,
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
  };
}

export type ProjectAggregateData = Awaited<ReturnType<typeof getProjectAggregateData>>;
