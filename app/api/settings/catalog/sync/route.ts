import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { fetchCostItems, parseTradePrefix } from "@/app/lib/jobtread/catalog-api";
import type { JTCostItem } from "@/app/lib/jobtread/catalog-api";

/**
 * POST /api/settings/catalog/sync
 *
 * Pulls all cost items from JobTread and upserts into PricingCatalogItem.
 * Fallback: accepts `{ items: [...] }` in POST body to seed from Data X exports.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Force flag: clear all existing data before re-sync
    if (body?.force) {
      await prisma.roomTemplateItem.deleteMany({});
      await prisma.roomTemplateTradeGroup.deleteMany({});
      await prisma.roomTemplate.deleteMany({});
      await prisma.estimateLineItem.deleteMany({});
      await prisma.aIEstimate.deleteMany({});
      await prisma.pricingCatalogItem.deleteMany({});
    }

    let items: JTCostItem[];

    if (Array.isArray(body?.items) && body.items.length > 0) {
      // Seed fallback: accept raw items from Data X
      items = body.items.map((item: Record<string, unknown>) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
        description: item.description != null ? String(item.description) : null,
        unitCost: item.unitCost != null ? Number(item.unitCost) : null,
        unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
        costCodeName: item.costCode != null ? String(item.costCode) : null,
        costCodeNumber: null,
        costTypeName: item.costType != null ? String(item.costType) : null,
        unitName: item.unit != null ? String(item.unit) : null,
        unitAbbreviation: item.unit != null ? String(item.unit) : null,
      }));
    } else {
      // Live fetch from JobTread Pave API
      items = await fetchCostItems();
    }

    let created = 0;
    let updated = 0;

    for (const item of items) {
      if (!item.id) continue;

      const costCode = [item.costCodeNumber, item.costCodeName]
        .filter(Boolean)
        .join(" - ") || null;

      const trade = parseTradePrefix(item.name);
      const unit = item.unitAbbreviation ?? item.unitName ?? "EA";

      const existing = await prisma.pricingCatalogItem.findUnique({
        where: { jobtreadId: item.id },
      });

      if (existing) {
        await prisma.pricingCatalogItem.update({
          where: { jobtreadId: item.id },
          data: {
            name: item.name,
            description: item.description,
            costCode,
            costType: item.costTypeName,
            unitCost: item.unitCost,
            unitPrice: item.unitPrice,
            unit,
            trade,
            lastSyncedAt: new Date(),
          },
        });
        updated++;
      } else {
        await prisma.pricingCatalogItem.create({
          data: {
            jobtreadId: item.id,
            name: item.name,
            description: item.description,
            costCode,
            costType: item.costTypeName,
            unitCost: item.unitCost,
            unitPrice: item.unitPrice,
            unit,
            trade,
          },
        });
        created++;
      }
    }

    return NextResponse.json({
      created,
      updated,
      total: created + updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error during catalog sync";
    console.error("[catalog/sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
