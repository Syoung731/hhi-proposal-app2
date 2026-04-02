import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { parseTradePrefix } from "@/app/lib/jobtread/catalog-api";

/**
 * POST /api/settings/catalog/seed
 *
 * Fallback seed route: accepts JSON array of catalog items from Data X exports.
 * Body: { items: Array<{id, name, description?, costCode?, costType?, unitCost?, unitPrice?, unit?}> }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawItems = body?.items;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json(
        { error: "Body must include a non-empty `items` array." },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;

    for (const item of rawItems) {
      const id = String(item.id ?? "").trim();
      if (!id) continue;

      const name = String(item.name ?? "");
      const trade = parseTradePrefix(name);
      const unit = item.unit != null ? String(item.unit) : "EA";

      const existing = await prisma.pricingCatalogItem.findUnique({
        where: { jobtreadId: id },
      });

      const data = {
        name,
        description: item.description != null ? String(item.description) : null,
        costCode: item.costCode != null ? String(item.costCode) : null,
        costType: item.costType != null ? String(item.costType) : null,
        unitCost: item.unitCost != null ? Number(item.unitCost) : null,
        unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
        unit,
        trade,
        lastSyncedAt: new Date(),
      };

      if (existing) {
        await prisma.pricingCatalogItem.update({
          where: { jobtreadId: id },
          data,
        });
        updated++;
      } else {
        await prisma.pricingCatalogItem.create({
          data: { jobtreadId: id, ...data },
        });
        created++;
      }
    }

    return NextResponse.json({ created, updated, total: created + updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error seeding catalog";
    console.error("[catalog/seed]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
