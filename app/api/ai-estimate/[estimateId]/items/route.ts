import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { calcItemPriceRange } from "@/app/lib/price-range";

type Params = { params: Promise<{ estimateId: string }> };

// ---------- POST — Add a new manual line item ----------

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { estimateId } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { tradeGroup, name, quantity, unit, unitCost, unitPrice } = body as {
      tradeGroup: string;
      name: string;
      quantity?: number;
      unit?: string;
      unitCost?: number;
      unitPrice?: number;
    };

    if (!tradeGroup || !name) {
      return NextResponse.json({ error: "tradeGroup and name are required" }, { status: 400 });
    }

    // Verify estimate exists
    const estimate = await prisma.aIEstimate.findUnique({ where: { id: estimateId } });
    if (!estimate) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    // Get max sort order for the trade group
    const maxSort = await prisma.estimateLineItem.findFirst({
      where: { estimateId, tradeGroup },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const qty = quantity ?? 1;
    const uc = unitCost ?? 0;
    const up = unitPrice ?? 0;
    const tp = qty * up;

    // Load range settings
    const ctx = await prisma.companyContext.findFirst();
    const lowPct = ctx?.priceRangeLowPct ?? -10;
    const highPct = ctx?.priceRangeHighPct ?? 10;
    const range = calcItemPriceRange(tp, "MANUAL", lowPct, highPct);

    const item = await prisma.estimateLineItem.create({
      data: {
        estimateId,
        tradeGroup,
        name,
        quantity: qty,
        unit: unit ?? "EA",
        unitCost: uc,
        unitPrice: up,
        totalCost: qty * uc,
        totalPrice: tp,
        totalPriceLow: range.totalPriceLow,
        totalPriceHigh: range.totalPriceHigh,
        source: "MANUAL",
        confidence: 1.0,
        sortOrder: (maxSort?.sortOrder ?? 0) + 1,
      },
    });

    // Record addition as a correction for feedback loop
    const room = await prisma.room.findUnique({
      where: { id: estimate.sectionId },
      select: { roomTemplateId: true },
    });
    await prisma.priceCorrection.create({
      data: {
        estimateId,
        lineItemId: item.id,
        field: "added",
        originalValue: 0,
        correctedValue: tp,
        catalogItemName: name,
        tradeGroup,
        roomTemplateId: room?.roomTemplateId ?? null,
      },
    });

    // Recalculate estimate totals
    const allItems = await prisma.estimateLineItem.findMany({
      where: { estimateId },
    });
    const totalCost = allItems.reduce((sum, i) => sum + i.totalCost, 0);
    const totalPrice = allItems.reduce((sum, i) => sum + i.totalPrice, 0);

    await prisma.aIEstimate.update({
      where: { id: estimateId },
      data: { totalCost, totalPrice },
    });

    return NextResponse.json({ item, totalCost, totalPrice });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-estimate] POST item error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
