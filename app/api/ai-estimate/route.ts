import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  generateRoomEstimate,
  GenerateRoomEstimateError,
} from "@/app/lib/ai/generate-room-estimate";
import type { ProjectContext } from "@/app/lib/ai-estimate-prompt";

// ---------- POST — Generate a new AI estimate ----------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      projectId,
      sectionId,
      roomTemplateId,
      scopeNarrative,
      squareFootage,
      projectContext,
    } = body as {
      projectId: string;
      sectionId: string;
      roomTemplateId: string;
      scopeNarrative: string;
      squareFootage?: number;
      projectContext?: ProjectContext;
    };

    if (!projectId || !sectionId || !roomTemplateId || !scopeNarrative) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: projectId, sectionId, roomTemplateId, scopeNarrative",
        },
        { status: 400 },
      );
    }

    const { estimate, warnings, usage } = await generateRoomEstimate({
      projectId,
      sectionId,
      roomTemplateId,
      scopeNarrative,
      squareFootage,
      projectContext,
    });

    return NextResponse.json({ estimate, warnings, usage });
  } catch (err) {
    if (err instanceof GenerateRoomEstimateError) {
      const status =
        err.code === "NOT_FOUND"
          ? 404
          : err.code === "MISCONFIGURED"
            ? 500
            : 502;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-estimate] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- GET — Retrieve latest estimate for project/section ----------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const sectionId = searchParams.get("sectionId");

    if (!projectId || !sectionId) {
      return NextResponse.json(
        { error: "Missing required query params: projectId, sectionId" },
        { status: 400 },
      );
    }

    const estimate = await prisma.aIEstimate.findFirst({
      where: { projectId, sectionId },
      orderBy: { createdAt: "desc" },
      include: {
        lineItems: {
          orderBy: { sortOrder: "asc" },
          include: { catalogItem: true },
        },
      },
    });

    return NextResponse.json({ estimate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-estimate] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
