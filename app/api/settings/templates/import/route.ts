import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  fetchCostGroupTemplateDetails,
  cleanDisplayName,
} from "@/app/lib/jobtread/catalog-api";

/**
 * POST /api/settings/templates/import
 *
 * Imports one or more cost group templates from JobTread.
 * Body: { templateIds: string[] }
 *
 * For each template:
 *  1. Fetch full details from JobTread
 *  2. Create RoomTemplate + RoomTemplateTradeGroup + RoomTemplateItem records
 *  3. Match items to PricingCatalogItem by exact name
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const templateIds: string[] = body?.templateIds;

    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return NextResponse.json(
        { error: "Body must include a non-empty `templateIds` array." },
        { status: 400 }
      );
    }

    // Pre-load all catalog items for name matching
    const catalogItems = await prisma.pricingCatalogItem.findMany({
      where: { active: true, hidden: false },
      select: { id: true, name: true },
    });
    const catalogByName = new Map(catalogItems.map((c) => [c.name, c.id]));

    const results: Array<{
      id: string;
      name: string;
      displayName: string;
      tradeGroupCount: number;
      itemCount: number;
    }> = [];

    for (const templateId of templateIds) {
      // Skip already-imported
      const existing = await prisma.roomTemplate.findUnique({
        where: { jobtreadId: templateId },
      });
      if (existing) {
        results.push({
          id: existing.id,
          name: existing.name,
          displayName: existing.displayName ?? existing.name,
          tradeGroupCount: 0,
          itemCount: 0,
        });
        continue;
      }

      const detail = await fetchCostGroupTemplateDetails(templateId);
      const displayName = cleanDisplayName(detail.name);

      const roomTemplate = await prisma.roomTemplate.create({
        data: {
          jobtreadId: templateId,
          name: detail.name,
          displayName,
        },
      });

      let totalItems = 0;

      for (let gi = 0; gi < detail.tradeGroups.length; gi++) {
        const tg = detail.tradeGroups[gi];
        const tradeGroup = await prisma.roomTemplateTradeGroup.create({
          data: {
            roomTemplateId: roomTemplate.id,
            name: tg.name,
            jobtreadGroupId: tg.id,
            sortOrder: gi,
          },
        });

        for (let ii = 0; ii < tg.items.length; ii++) {
          const item = tg.items[ii];
          const catalogItemId = catalogByName.get(item.name) ?? null;

          const costCode = item.costCodeName ?? null;
          const costType = item.costTypeName ?? null;

          await prisma.roomTemplateItem.create({
            data: {
              tradeGroupId: tradeGroup.id,
              catalogItemId,
              jobtreadItemId: item.id,
              name: item.name,
              costCode,
              costType,
              sortOrder: ii,
            },
          });
          totalItems++;
        }
      }

      results.push({
        id: roomTemplate.id,
        name: detail.name,
        displayName,
        tradeGroupCount: detail.tradeGroups.length,
        itemCount: totalItems,
      });
    }

    return NextResponse.json({ imported: results });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error importing templates";
    console.error("[templates/import]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
