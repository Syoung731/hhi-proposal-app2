import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { cleanDisplayName, isCopeTemplate } from "@/app/lib/jobtread/catalog-api";

/**
 * POST /api/settings/templates/seed
 *
 * Fallback seed route: accepts a template with groups and items from Data X exports.
 * Body: { template: {id, name, groups: Array<{id, name, items: Array<{id, name, costCode?, costType?}>}>} }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tpl = body?.template;

    if (!tpl?.id || !tpl?.name || !Array.isArray(tpl?.groups)) {
      return NextResponse.json(
        {
          error:
            "Body must include `template` with id, name, and groups array.",
        },
        { status: 400 }
      );
    }

    // Skip if already imported
    const existing = await prisma.roomTemplate.findUnique({
      where: { jobtreadId: String(tpl.id) },
    });
    if (existing) {
      return NextResponse.json({
        message: "Template already imported",
        id: existing.id,
      });
    }

    // Pre-load catalog for name matching
    const catalogItems = await prisma.pricingCatalogItem.findMany({
      where: { active: true, hidden: false },
      select: { id: true, name: true },
    });
    const catalogByName = new Map(catalogItems.map((c) => [c.name, c.id]));

    const displayName = cleanDisplayName(tpl.name);

    const roomTemplate = await prisma.roomTemplate.create({
      data: {
        jobtreadId: String(tpl.id),
        name: tpl.name,
        displayName,
        isProjectOverhead: isCopeTemplate(displayName),
      },
    });

    let totalItems = 0;

    for (let gi = 0; gi < tpl.groups.length; gi++) {
      const g = tpl.groups[gi];
      const tradeGroup = await prisma.roomTemplateTradeGroup.create({
        data: {
          roomTemplateId: roomTemplate.id,
          name: String(g.name ?? ""),
          jobtreadGroupId: g.id != null ? String(g.id) : null,
          sortOrder: gi,
        },
      });

      const items = Array.isArray(g.items) ? g.items : [];
      for (let ii = 0; ii < items.length; ii++) {
        const item = items[ii];
        const itemName = String(item.name ?? "");
        const catalogItemId = catalogByName.get(itemName) ?? null;

        await prisma.roomTemplateItem.create({
          data: {
            tradeGroupId: tradeGroup.id,
            catalogItemId,
            jobtreadItemId: item.id != null ? String(item.id) : null,
            name: itemName,
            costCode: item.costCode != null ? String(item.costCode) : null,
            costType: item.costType != null ? String(item.costType) : null,
            sortOrder: ii,
          },
        });
        totalItems++;
      }
    }

    return NextResponse.json({
      id: roomTemplate.id,
      name: tpl.name,
      displayName,
      tradeGroupCount: tpl.groups.length,
      itemCount: totalItems,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error seeding template";
    console.error("[templates/seed]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
