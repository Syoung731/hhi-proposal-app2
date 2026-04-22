import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  generateProjectOverhead,
  ProjectOverheadError,
} from "@/app/lib/ai/generate-project-overhead";

/**
 * Phase 8C: thin HTTP wrapper around `generateProjectOverhead()`.
 *
 * Used by two direct callers:
 *   1. The rooms tab's "Regenerate COPE Only" button (CopeRoomCard).
 *   2. Part C's banner "Generate/Update/Retry Project Overhead" button.
 *
 * The QStash auto-trigger worker at `/api/jobs/cope-generate` does NOT
 * hit this route — it calls the service directly. Both paths share the
 * same `Project.copeStatus` idempotency lock inside the service, so
 * concurrent triggers cannot produce duplicate AIEstimate rows.
 *
 * Status code mapping (per spec + one clarification — MISCONFIGURED = 400
 * preserves existing client behavior for "generate estimates first"):
 *   NOT_FOUND     -> 404
 *   MISCONFIGURED -> 400
 *   BUSY          -> 409 (client should poll project.copeStatus, not retry)
 *   UPSTREAM      -> 502
 *   otherwise     -> 500
 */

// COPE calls are 60-120s against the Anthropic API. Without this we time
// out on Vercel Pro's 60s default.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const projectId = (body as { projectId?: string } | null)?.projectId;
    if (!projectId) {
      return NextResponse.json(
        { error: "Missing required field: projectId" },
        { status: 400 },
      );
    }

    const { estimate, warnings, usage } = await generateProjectOverhead({ projectId });

    // Preserve the legacy response shape that the rooms tab's CopeRoomCard
    // and Part C's banner retry rely on.
    return NextResponse.json({ estimate, warnings, usage });
  } catch (err) {
    if (err instanceof ProjectOverheadError) {
      const status =
        err.code === "NOT_FOUND"
          ? 404
          : err.code === "MISCONFIGURED"
            ? 400
            : err.code === "BUSY"
              ? 409
              : err.code === "UPSTREAM"
                ? 502
                : 500;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cope-estimate] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/cope-estimate?projectId=...
 *
 * Returns the latest COPE AIEstimate for the project, or `{ estimate: null }`
 * if one has never been generated. Unchanged from the pre-Phase-8C version
 * — used by the rooms tab to hydrate the COPE row's current estimate card.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing required query param: projectId" },
        { status: 400 },
      );
    }

    // Find the COPE room
    const copeRoom = await prisma.room.findFirst({
      where: { projectId, isProjectOverhead: true },
      select: { id: true },
    });

    if (!copeRoom) {
      return NextResponse.json({ estimate: null });
    }

    // Find the latest estimate for the COPE room
    const estimate = await prisma.aIEstimate.findFirst({
      where: { projectId, sectionId: copeRoom.id },
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
    console.error("[cope-estimate] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
