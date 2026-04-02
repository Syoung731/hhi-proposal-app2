import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

/**
 * GET /api/settings/context
 * Returns the singleton CompanyContext record (creates one if missing).
 */
export async function GET() {
  try {
    let ctx = await prisma.companyContext.findFirst();
    if (!ctx) {
      ctx = await prisma.companyContext.create({ data: {} });
    }
    // Also include accent color from CompanySettings for UI theming
    const settings = await prisma.companySettings.findFirst({
      select: { primaryColorHex: true },
    });
    return NextResponse.json({
      ...ctx,
      accentColor: settings?.primaryColorHex ?? "#F47216",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/settings/context
 * Updates the singleton CompanyContext record.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    let ctx = await prisma.companyContext.findFirst();
    if (!ctx) {
      ctx = await prisma.companyContext.create({ data: {} });
    }

    const updated = await prisma.companyContext.update({
      where: { id: ctx.id },
      data: {
        market: body.market ?? ctx.market,
        marketNotes: body.marketNotes ?? ctx.marketNotes,
        clientProfile: body.clientProfile ?? ctx.clientProfile,
        defaultFinishTier: body.defaultFinishTier ?? ctx.defaultFinishTier,
        standardInclusions: body.standardInclusions ?? ctx.standardInclusions,
        markupStructure: body.markupStructure ?? ctx.markupStructure,
        notes: body.notes ?? ctx.notes,
        estimationAssumptions: body.estimationAssumptions ?? ctx.estimationAssumptions,
        priceRangeLowPct: body.priceRangeLowPct ?? ctx.priceRangeLowPct,
        priceRangeHighPct: body.priceRangeHighPct ?? ctx.priceRangeHighPct,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
