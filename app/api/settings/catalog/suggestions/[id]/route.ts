import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { status } = body as { status: string };

    const data: Record<string, unknown> = { status };
    if (status === "dismissed") {
      data.resolvedAt = new Date();
    } else if (status === "pending") {
      data.resolvedAt = null;
    }

    const suggestion = await prisma.catalogSuggestion.update({
      where: { id },
      data,
    });

    return NextResponse.json({ suggestion });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
