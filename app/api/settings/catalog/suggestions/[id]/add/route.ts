import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const suggestion = await prisma.catalogSuggestion.findUnique({
      where: { id },
    });
    if (!suggestion) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    // Build catalog item name with trade group prefix if available
    let catalogName = suggestion.itemName;
    if (suggestion.tradeGroup) {
      // Extract prefix from trade group (e.g. "Demo" → "[DMO]")
      // If the item already has a prefix, skip
      if (!catalogName.match(/^\[[\w]+\]/)) {
        const prefix = suggestion.tradeGroup.slice(0, 3).toUpperCase();
        catalogName = `[${prefix}] ${catalogName}`;
      }
    }

    // Create a new PricingCatalogItem
    const catalogItem = await prisma.pricingCatalogItem.create({
      data: {
        jobtreadId: `suggestion-${suggestion.id}`,
        name: catalogName,
        unitPrice: suggestion.avgUnitPrice ?? 0,
        unitCost: suggestion.avgUnitCost ?? 0,
        unit: suggestion.suggestedUnit ?? "EA",
        trade: suggestion.tradeGroup ?? null,
        active: true,
      },
    });

    // Update suggestion status
    await prisma.catalogSuggestion.update({
      where: { id },
      data: {
        status: "added",
        catalogItemId: catalogItem.id,
        resolvedAt: new Date(),
      },
    });

    return NextResponse.json({ catalogItem });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
