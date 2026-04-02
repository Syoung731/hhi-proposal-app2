import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

/**
 * GET /api/settings/templates/imported
 *
 * Returns all RoomTemplates with nested tradeGroups and items.
 */
export async function GET() {
  try {
    const templates = await prisma.roomTemplate.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        tradeGroups: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
              include: {
                catalogItem: {
                  select: {
                    id: true,
                    name: true,
                    unitCost: true,
                    unitPrice: true,
                    unit: true,
                    trade: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error fetching imported templates";
    console.error("[templates/imported]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/templates/imported
 *
 * Toggle active state of a RoomTemplate.
 * Body: { id: string, active: boolean }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, active } = body;
    if (!id || typeof active !== "boolean") {
      return NextResponse.json({ error: "id and active (boolean) are required" }, { status: 400 });
    }
    const updated = await prisma.roomTemplate.update({
      where: { id },
      data: { active },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
