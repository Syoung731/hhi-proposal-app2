import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type Params = { params: Promise<{ estimateId: string }> };

// ---------- PATCH — Accept an estimate ----------

export async function PATCH(_request: NextRequest, { params }: Params) {
  try {
    const { estimateId } = await params;

    const estimate = await prisma.aIEstimate.findUnique({
      where: { id: estimateId },
    });
    if (!estimate) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    // Set estimate status to accepted
    const updated = await prisma.aIEstimate.update({
      where: { id: estimateId },
      data: { status: "accepted" },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    // Write the estimate total into the Room's pricing fields
    // so it flows into the Investment tab rollup
    if (updated.totalPrice != null) {
      await prisma.room.update({
        where: { id: updated.sectionId },
        data: {
          totalLow: updated.totalPrice,
          totalTarget: updated.totalPrice,
          totalHigh: updated.totalPrice,
        },
      });
    }

    return NextResponse.json({ estimate: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-estimate] accept error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
