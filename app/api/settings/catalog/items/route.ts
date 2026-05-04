import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

/**
 * GET /api/settings/catalog/items
 *
 * Returns all active PricingCatalogItem records.
 * Supports query params: ?search=, ?trade=, ?costType=
 * Sorted by trade, then name.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim();
    const trade = searchParams.get("trade")?.trim();
    const costType = searchParams.get("costType")?.trim();
    const includeHidden = searchParams.get("includeHidden") === "true";

    const where: Record<string, unknown> = { active: true };
    if (!includeHidden) where.hidden = false;

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }
    if (trade) {
      where.trade = trade;
    }
    if (costType) {
      where.costType = { contains: costType, mode: "insensitive" };
    }

    const items = await prisma.pricingCatalogItem.findMany({
      where,
      orderBy: [{ trade: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error fetching catalog items";
    console.error("[catalog/items]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
