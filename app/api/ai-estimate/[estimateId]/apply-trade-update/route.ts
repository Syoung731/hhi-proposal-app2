import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { calcItemPriceRange } from "@/app/lib/price-range";
import { resolvePolicyUnitPrice } from "@/app/lib/ai/estimate-margin-policy";
import type { TradeUpdateProposal } from "@/app/lib/ai-trade-update-prompt";

type Params = { params: Promise<{ estimateId: string }> };

/**
 * POST /api/ai-estimate/[estimateId]/apply-trade-update
 *
 * Applies a previously-generated diff proposal to the estimate.
 * Body: { tradeGroup: string, proposal: TradeUpdateProposal }
 *
 * All changes are recorded as PriceCorrection rows for the learning loop.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { estimateId } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

    const { tradeGroup, proposal, allowZeroPrice } = body as {
      tradeGroup: string;
      proposal: TradeUpdateProposal;
      allowZeroPrice?: boolean;
    };
    if (!tradeGroup || !proposal) {
      return NextResponse.json({ error: "tradeGroup and proposal are required" }, { status: 400 });
    }

    // Validate: no $0 ADD ops unless explicitly allowed (scope says "no charge" etc.)
    if (!allowZeroPrice) {
      const zeroPriceAdds = (proposal.add ?? []).filter((op) => (op.unitPrice ?? 0) === 0 && (op.quantity ?? 0) > 0);
      if (zeroPriceAdds.length > 0) {
        return NextResponse.json({
          error: "Cannot apply: one or more ADD items have $0 unitPrice.",
          zeroPriceItems: zeroPriceAdds.map((op) => op.name),
        }, { status: 400 });
      }
    }

    const estimate = await prisma.aIEstimate.findUnique({ where: { id: estimateId } });
    if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

    const room = await prisma.room.findUnique({
      where: { id: estimate.sectionId },
      select: { roomTemplateId: true },
    });

    // Load range settings
    const ctx = await prisma.companyContext.findFirst();
    const lowPct = ctx?.priceRangeLowPct ?? -10;
    const highPct = ctx?.priceRangeHighPct ?? 10;

    let added = 0;
    let updated = 0;
    let deleted = 0;

    // --- DELETE operations ---
    for (const op of proposal.delete ?? []) {
      const existing = await prisma.estimateLineItem.findFirst({
        where: { id: op.id, estimateId, tradeGroup },
      });
      if (!existing) continue;
      // Record correction BEFORE deleting (matches existing DELETE route pattern)
      await prisma.priceCorrection.create({
        data: {
          estimateId,
          lineItemId: existing.id,
          field: "removed",
          originalValue: existing.totalPrice,
          correctedValue: 0,
          catalogItemName: existing.name,
          tradeGroup,
          roomTemplateId: room?.roomTemplateId ?? null,
        },
      });
      await prisma.estimateLineItem.delete({ where: { id: existing.id } });
      deleted++;
    }

    // --- UPDATE operations ---
    for (const op of proposal.update ?? []) {
      const existing = await prisma.estimateLineItem.findFirst({
        where: { id: op.id, estimateId, tradeGroup },
      });
      if (!existing) continue;

      const newQty = op.quantity ?? existing.quantity;
      const newUC = op.unitCost ?? existing.unitCost;
      const newName = op.name ?? existing.name;
      const newUnit = op.unit ?? existing.unit;
      // Apply HHI margin policy to AI-derived lines (materials at cost, labor 60%);
      // catalog/manual sources + ambiguous lines keep the proposed price.
      const newUP = resolvePolicyUnitPrice(
        newName,
        existing.source,
        newUC,
        op.unitPrice ?? existing.unitPrice,
      );
      const newTotalPrice = newQty * newUP;
      const range = calcItemPriceRange(newTotalPrice, existing.source, lowPct, highPct);

      await prisma.estimateLineItem.update({
        where: { id: existing.id },
        data: {
          name: newName,
          unit: newUnit,
          quantity: newQty,
          unitCost: newUC,
          unitPrice: newUP,
          totalCost: newQty * newUC,
          totalPrice: newTotalPrice,
          totalPriceLow: range.totalPriceLow,
          totalPriceHigh: range.totalPriceHigh,
        },
      });

      // Record corrections for any changed fields
      const corrections: { field: string; original: number; corrected: number }[] = [];
      if (op.quantity != null && op.quantity !== existing.quantity) {
        corrections.push({ field: "quantity", original: existing.quantity, corrected: op.quantity });
      }
      if (op.unitCost != null && op.unitCost !== existing.unitCost) {
        corrections.push({ field: "unitCost", original: existing.unitCost, corrected: op.unitCost });
      }
      if (op.unitPrice != null && op.unitPrice !== existing.unitPrice) {
        corrections.push({ field: "unitPrice", original: existing.unitPrice, corrected: op.unitPrice });
      }
      for (const c of corrections) {
        await prisma.priceCorrection.create({
          data: {
            estimateId,
            lineItemId: existing.id,
            field: c.field,
            originalValue: c.original,
            correctedValue: c.corrected,
            catalogItemName: existing.name,
            tradeGroup,
            roomTemplateId: room?.roomTemplateId ?? null,
          },
        });
      }
      updated++;
    }

    // --- ADD operations ---
    const maxSort = await prisma.estimateLineItem.findFirst({
      where: { estimateId, tradeGroup },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextSort = (maxSort?.sortOrder ?? 0) + 1;

    for (const op of proposal.add ?? []) {
      const qty = op.quantity ?? 1;
      const uc = op.unitCost ?? 0;
      // Honor AI's declared source; fall back based on catalog match.
      // If the AI overrode a $0 catalog item with real prices, treat as AI_PRICED, not CATALOG.
      let source: string;
      if (op.source) {
        source = op.source;
      } else if (op.catalogItemId) {
        source = "CATALOG";
      } else {
        source = "AI_PRICED";
      }
      // Apply HHI margin policy to AI-derived lines; catalog/manual + ambiguous
      // lines keep the proposed price.
      const up = resolvePolicyUnitPrice(op.name, source, uc, op.unitPrice ?? 0);
      const tp = qty * up;
      const range = calcItemPriceRange(tp, source, lowPct, highPct);

      const item = await prisma.estimateLineItem.create({
        data: {
          estimateId,
          tradeGroup,
          name: op.name,
          quantity: qty,
          unit: op.unit ?? "EA",
          unitCost: uc,
          unitPrice: up,
          totalCost: qty * uc,
          totalPrice: tp,
          totalPriceLow: range.totalPriceLow,
          totalPriceHigh: range.totalPriceHigh,
          notes: op.reason ?? null,
          source,
          confidence: 0.9,
          catalogItemId: op.catalogItemId ?? null,
          sortOrder: nextSort++,
        },
      });

      await prisma.priceCorrection.create({
        data: {
          estimateId,
          lineItemId: item.id,
          field: "added",
          originalValue: 0,
          correctedValue: tp,
          catalogItemName: op.name,
          tradeGroup,
          roomTemplateId: room?.roomTemplateId ?? null,
        },
      });
      added++;
    }

    // Recalculate estimate totals
    const allItems = await prisma.estimateLineItem.findMany({ where: { estimateId } });
    const totalCost = allItems.reduce((s, i) => s + i.totalCost, 0);
    const totalPrice = allItems.reduce((s, i) => s + i.totalPrice, 0);

    await prisma.aIEstimate.update({
      where: { id: estimateId },
      data: { totalCost, totalPrice },
    });

    // Return the fresh estimate with updated items
    const refreshed = await prisma.aIEstimate.findUnique({
      where: { id: estimateId },
      include: { lineItems: { orderBy: [{ tradeGroup: "asc" }, { sortOrder: "asc" }] } },
    });

    return NextResponse.json({
      estimate: refreshed,
      stats: { added, updated, deleted },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[apply-trade-update] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
