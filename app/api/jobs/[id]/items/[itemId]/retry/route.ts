import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { publishEstimateWorkerMessage } from "@/app/lib/ai/estimate-job";

/**
 * POST /api/jobs/[id]/items/[itemId]/retry
 *
 * Requeue a single failed `JobItem`. Used by the failed-room retry UI
 * after a bulk job lands as PARTIAL.
 *
 * Behaviour:
 *   - Validates the item actually belongs to the job (defence against URL tampering).
 *   - Only retries items currently in FAILED status — retrying a
 *     COMPLETED or in-flight item would create duplicate work.
 *   - Decrements the parent's `failedItems` counter so the roll-up
 *     math stays correct.
 *   - If the parent is terminal (FAILED/PARTIAL/COMPLETED), bumps it
 *     back to RUNNING and clears `completedAt` so progress polling
 *     shows "in flight" again.
 *   - Resets the item to QUEUED with `attempts=0, error=null` so the
 *     worker's failure-counter logic starts fresh.
 *   - Publishes a fresh QStash message with the same flow-control key,
 *     so retries are throttled alongside in-flight bulk jobs.
 */

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id, itemId } = await params;

    const item = await prisma.jobItem.findUnique({
      where: { id: itemId },
      select: { id: true, estimateJobId: true, status: true },
    });
    if (!item) {
      return NextResponse.json({ error: "JobItem not found" }, { status: 404 });
    }
    if (item.estimateJobId !== id) {
      return NextResponse.json(
        { error: "JobItem does not belong to this job" },
        { status: 400 },
      );
    }
    if (item.status !== "FAILED") {
      return NextResponse.json(
        {
          error: `Cannot retry item in status ${item.status}; retries are only for FAILED items`,
        },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.jobItem.update({
        where: { id: itemId },
        data: {
          status: "QUEUED",
          attempts: 0,
          error: null,
          startedAt: null,
          finishedAt: null,
        },
      });
      // Decrement parent failedItems; re-open the job if it was terminal.
      await tx.estimateJob.update({
        where: { id },
        data: {
          failedItems: { decrement: 1 },
          status: "RUNNING",
          completedAt: null,
        },
      });
    });

    await publishEstimateWorkerMessage(itemId);

    return NextResponse.json({ status: "requeued", itemId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[jobs/:id/items/:itemId/retry] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
