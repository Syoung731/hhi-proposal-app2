import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

/**
 * GET /api/jobs/[id]
 *
 * Progress polling endpoint — the UI banner hits this on a 2–5s cadence
 * while a bulk estimate is in flight. Returns the parent job state plus
 * a flat list of items (sorted by room name) so the UI can render a
 * per-room status list without a second round-trip.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const job = await prisma.estimateJob.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, title: true } },
        items: {
          include: { room: { select: { id: true, name: true } } },
          // Deterministic order for stable UI rendering.
          orderBy: { room: { name: "asc" } },
        },
      },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      projectId: job.projectId,
      projectTitle: job.project.title,
      status: job.status,
      totalItems: job.totalItems,
      completedItems: job.completedItems,
      failedItems: job.failedItems,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      items: job.items.map((i) => ({
        id: i.id,
        roomId: i.roomId,
        roomName: i.room.name,
        status: i.status,
        attempts: i.attempts,
        startedAt: i.startedAt,
        finishedAt: i.finishedAt,
        error: i.error,
        estimateId: i.estimateId,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[jobs/:id] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
