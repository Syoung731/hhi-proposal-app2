import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { calcItemPriceRange } from "@/app/lib/price-range";

type Params = { params: Promise<{ estimateId: string; itemId: string }> };

/** Look up the roomTemplateId for an estimate (via estimate → room → roomTemplateId). */
async function getRoomTemplateId(estimateId: string): Promise<string | null> {
  const est = await prisma.aIEstimate.findUnique({
    where: { id: estimateId },
    select: { sectionId: true },
  });
  if (!est) return null;
  const room = await prisma.room.findUnique({
    where: { id: est.sectionId },
    select: { roomTemplateId: true },
  });
  return room?.roomTemplateId ?? null;
}

// ---------- PATCH — Update a line item (quantity, price, etc.) ----------

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { estimateId, itemId } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { quantity, unitCost, unitPrice } = body as {
      quantity?: number;
      unitCost?: number;
      unitPrice?: number;
    };

    // Verify item belongs to estimate
    const existing = await prisma.estimateLineItem.findFirst({
      where: { id: itemId, estimateId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Line item not found" }, { status: 404 });
    }

    const newQty = quantity ?? existing.quantity;
    const newUnitCost = unitCost ?? existing.unitCost;
    const newUnitPrice = unitPrice ?? existing.unitPrice;
    const newTotalPrice = newQty * newUnitPrice;

    // Record PriceCorrection for each changed numeric field
    const roomTemplateId = await getRoomTemplateId(estimateId);
    const corrections: { field: string; originalValue: number; correctedValue: number }[] = [];

    if (quantity !== undefined && quantity !== existing.quantity) {
      corrections.push({ field: "quantity", originalValue: existing.quantity, correctedValue: quantity });
    }
    if (unitCost !== undefined && unitCost !== existing.unitCost) {
      corrections.push({ field: "unitCost", originalValue: existing.unitCost, correctedValue: unitCost });
    }
    if (unitPrice !== undefined && unitPrice !== existing.unitPrice) {
      corrections.push({ field: "unitPrice", originalValue: existing.unitPrice, correctedValue: unitPrice });
    }

    if (corrections.length > 0) {
      await prisma.priceCorrection.createMany({
        data: corrections.map((c) => ({
          estimateId,
          lineItemId: itemId,
          field: c.field,
          originalValue: c.originalValue,
          correctedValue: c.correctedValue,
          catalogItemName: existing.name,
          tradeGroup: existing.tradeGroup,
          roomTemplateId,
        })),
      });
    }

    // Load range settings for recalculation
    const ctx = await prisma.companyContext.findFirst();
    const lowPct = ctx?.priceRangeLowPct ?? -10;
    const highPct = ctx?.priceRangeHighPct ?? 10;
    const range = calcItemPriceRange(newTotalPrice, "MANUAL", lowPct, highPct);

    const item = await prisma.estimateLineItem.update({
      where: { id: itemId },
      data: {
        quantity: newQty,
        unitCost: newUnitCost,
        unitPrice: newUnitPrice,
        totalCost: newQty * newUnitCost,
        totalPrice: newTotalPrice,
        totalPriceLow: range.totalPriceLow,
        totalPriceHigh: range.totalPriceHigh,
        source: "MANUAL",
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
    console.error("[ai-estimate] PATCH item error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- DELETE — Remove a line item ----------

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { estimateId, itemId } = await params;

    const existing = await prisma.estimateLineItem.findFirst({
      where: { id: itemId, estimateId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Line item not found" }, { status: 404 });
    }

    // Record deletion as a correction
    const roomTemplateId = await getRoomTemplateId(estimateId);
    await prisma.priceCorrection.create({
      data: {
        estimateId,
        lineItemId: itemId,
        field: "removed",
        originalValue: existing.totalPrice,
        correctedValue: 0,
        catalogItemName: existing.name,
        tradeGroup: existing.tradeGroup,
        roomTemplateId,
      },
    });

    await prisma.estimateLineItem.delete({ where: { id: itemId } });

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

    return NextResponse.json({ success: true, totalCost, totalPrice });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-estimate] DELETE item error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
