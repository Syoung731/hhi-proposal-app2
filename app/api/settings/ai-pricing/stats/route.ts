import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  try {
    // Top-line metrics
    const totalEstimates = await prisma.aIEstimate.count();
    const totalLineItems = await prisma.estimateLineItem.count();
    const totalCorrections = await prisma.priceCorrection.count();

    const estimateAgg = await prisma.aIEstimate.aggregate({
      _avg: { totalPrice: true },
      _sum: { promptTokens: true, completionTokens: true },
    });

    const avgEstimateTotal = estimateAgg._avg.totalPrice ?? 0;
    const avgItemsPerEstimate = totalEstimates > 0 ? totalLineItems / totalEstimates : 0;

    // API cost calculation (Sonnet rates: $3/M input, $15/M output)
    const promptTokens = estimateAgg._sum.promptTokens ?? 0;
    const completionTokens = estimateAgg._sum.completionTokens ?? 0;
    const totalApiCost = (promptTokens / 1_000_000 * 3) + (completionTokens / 1_000_000 * 15);

    // Source distribution
    const sourceGroups = await prisma.estimateLineItem.groupBy({
      by: ["source"],
      _count: { id: true },
    });
    const sourceDistribution = sourceGroups.map((g) => ({
      source: g.source,
      count: g._count.id,
      percentage: totalLineItems > 0 ? Math.round((g._count.id / totalLineItems) * 1000) / 10 : 0,
    }));

    // Catalog match rate - overall
    const catalogCount = sourceGroups
      .filter((g) => g.source === "CATALOG" || g.source === "ALLOWANCE")
      .reduce((sum, g) => sum + g._count.id, 0);
    const overallMatchRate = totalLineItems > 0 ? Math.round((catalogCount / totalLineItems) * 1000) / 10 : 0;

    // Catalog match rate by template
    const templateStats = await prisma.$queryRaw<
      Array<{ roomTemplateId: string; templateName: string; totalItems: number; catalogItems: number }>
    >`
      SELECT
        e."roomTemplateId",
        COALESCE(rt."displayName", rt."name", 'Unknown') as "templateName",
        COUNT(li.id)::int as "totalItems",
        COUNT(CASE WHEN li.source IN ('CATALOG', 'ALLOWANCE') THEN 1 END)::int as "catalogItems"
      FROM "EstimateLineItem" li
      JOIN "AIEstimate" e ON li."estimateId" = e.id
      LEFT JOIN "RoomTemplate" rt ON e."roomTemplateId" = rt.id
      WHERE e."roomTemplateId" IS NOT NULL
      GROUP BY e."roomTemplateId", rt."displayName", rt."name"
      ORDER BY COUNT(li.id) DESC
    `;

    const matchRateByTemplate = templateStats.map((t) => ({
      templateName: t.templateName,
      matchRate: t.totalItems > 0 ? Math.round((t.catalogItems / t.totalItems) * 1000) / 10 : 0,
      totalItems: t.totalItems,
    }));

    // Most common AI-priced items (top 10)
    const aiPricedGroups = await prisma.estimateLineItem.groupBy({
      by: ["name", "tradeGroup"],
      where: { source: "AI_PRICED" },
      _count: { id: true },
      _avg: { unitPrice: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });
    const commonAiPriced = aiPricedGroups.map((g) => ({
      name: g.name,
      tradeGroup: g.tradeGroup,
      count: g._count.id,
      avgPrice: Math.round((g._avg.unitPrice ?? 0) * 100) / 100,
    }));

    // Most corrected items (top 10)
    const correctionGroups = await prisma.priceCorrection.groupBy({
      by: ["catalogItemName", "field"],
      _count: { id: true },
      _avg: { originalValue: true, correctedValue: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });
    const mostCorrected = correctionGroups.map((g) => ({
      name: g.catalogItemName ?? "Unknown",
      field: g.field,
      avgOriginal: Math.round((g._avg.originalValue ?? 0) * 100) / 100,
      avgCorrected: Math.round((g._avg.correctedValue ?? 0) * 100) / 100,
      count: g._count.id,
    }));

    // Recent estimates (last 10)
    const recentEstimates = await prisma.aIEstimate.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        sectionId: true,
        totalPrice: true,
        _count: { select: { lineItems: true, priceCorrections: true } },
      },
    });

    // Look up room names for recent estimates
    const sectionIds = recentEstimates.map((e) => e.sectionId);
    const rooms = await prisma.room.findMany({
      where: { id: { in: sectionIds } },
      select: { id: true, name: true },
    });
    const roomNameMap = new Map(rooms.map((r) => [r.id, r.name]));

    const recentEstimatesSummary = recentEstimates.map((e) => ({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      roomName: roomNameMap.get(e.sectionId) ?? "Unknown",
      totalPrice: e.totalPrice ?? 0,
      lineItemCount: e._count.lineItems,
      correctionCount: e._count.priceCorrections,
    }));

    return NextResponse.json({
      totalEstimates,
      totalLineItems,
      avgEstimateTotal,
      avgItemsPerEstimate: Math.round(avgItemsPerEstimate * 10) / 10,
      totalCorrections,
      totalApiCost,
      sourceDistribution,
      overallMatchRate,
      matchRateByTemplate,
      commonAiPriced,
      mostCorrected,
      recentEstimates: recentEstimatesSummary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-pricing-stats] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
