import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

// ---------- GET — Retrieve a specific estimate by ID ----------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> },
) {
  try {
    const { estimateId } = await params;

    const estimate = await prisma.aIEstimate.findUnique({
      where: { id: estimateId },
      include: {
        lineItems: {
          orderBy: { sortOrder: "asc" },
          include: { catalogItem: true },
        },
        roomTemplate: true,
      },
    });

    if (!estimate) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    return NextResponse.json({ estimate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-estimate] GET by ID error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
