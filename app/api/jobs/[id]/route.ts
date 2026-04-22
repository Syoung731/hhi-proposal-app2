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

    // Running these in parallel saves one roundtrip on the banner's 3s poll
    // cadence. `autoGenerateCope` is read from the CompanySettings singleton
    // so the banner can distinguish "IDLE because auto-trigger is off" from
    // "IDLE because the QStash worker hasn't acquired the lock yet".
    const [job, settings] = await Promise.all([
      prisma.estimateJob.findUnique({
        where: { id },
        include: {
          // Phase 8C: project.cope* fields surface COPE auto-trigger state
          // so the banner can render its combined EstimateJob+COPE state
          // machine without a second poll.
          project: {
            select: {
              id: true,
              title: true,
              copeStatus: true,
              copeGeneratedAt: true,
              copeError: true,
            },
          },
          items: {
            include: { room: { select: { id: true, name: true } } },
            // Deterministic order for stable UI rendering.
            orderBy: { room: { name: "asc" } },
          },
        },
      }),
      prisma.companySettings.findFirst({ select: { autoGenerateCope: true } }),
    ]);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      projectId: job.projectId,
      projectTitle: job.project.title,
      project: {
        id: job.project.id,
        title: job.project.title,
        copeStatus: job.project.copeStatus,
        copeGeneratedAt: job.project.copeGeneratedAt,
        copeError: job.project.copeError,
      },
      // Default to `true` to match the schema default when no CompanySettings row exists yet.
      autoGenerateCope: settings?.autoGenerateCope ?? true,
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
