import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

/**
 * PATCH /api/settings/templates/items/[itemId]
 *
 * Toggle isActive on a RoomTemplateItem.
 * Body: { isActive: boolean }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await params;
    const body = await req.json();
    const { isActive } = body;
    if (typeof isActive !== "boolean") {
      return NextResponse.json(
        { error: "isActive (boolean) is required" },
        { status: 400 },
      );
    }
    const updated = await prisma.roomTemplateItem.update({
      where: { id: itemId },
      data: { isActive },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
