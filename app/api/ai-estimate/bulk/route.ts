import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";
import {
  publishEstimateWorkerMessage,
  runJobItemsInline,
  type JobItemPayload,
} from "@/app/lib/ai/estimate-job";
import type { ProjectContext } from "@/app/lib/ai-estimate-prompt";

/**
 * POST /api/ai-estimate/bulk
 *
 * Entry point for background bulk estimate generation. Creates one
 * `EstimateJob` row and a `JobItem` per room in a single transaction,
 * then fans out one QStash message per JobItem. Returns in ~100ms with
 * `{ jobId, totalItems }` so the client can close the modal and navigate
 * away while workers process in the background.
 *
 * The QStash fan-out respects the flow-control parallelism cap from
 * `CompanySettings.aiEstimateConcurrency` (default 8) — QStash itself
 * throttles the worker URL, so no client-side semaphore is needed.
 */

interface BulkRoomInput {
  roomId: string;
  roomTemplateId: string;
  scopeNarrative: string;
  squareFootage?: number;
  projectContext?: ProjectContext;
}

interface BulkBody {
  projectId: string;
  rooms: BulkRoomInput[];
  /** Optional audit payload; stored on `EstimateJob.metadata` for later inspection. */
  metadata?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as BulkBody | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { projectId, rooms, metadata } = body;
    if (!projectId || !Array.isArray(rooms) || rooms.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, rooms[]" },
        { status: 400 },
      );
    }

    // Validate each room input up-front so we fail fast and atomically,
    // before persisting a partial job.
    for (const r of rooms) {
      if (!r.roomId || !r.roomTemplateId || typeof r.scopeNarrative !== "string") {
        return NextResponse.json(
          {
            error:
              "Each rooms[] entry requires roomId, roomTemplateId, and scopeNarrative",
          },
          { status: 400 },
        );
      }
    }

    // Confirm every roomId belongs to this project to avoid cross-tenant leaks.
    const matchingRoomCount = await prisma.room.count({
      where: { id: { in: rooms.map((r) => r.roomId) }, projectId },
    });
    if (matchingRoomCount !== rooms.length) {
      return NextResponse.json(
        { error: "One or more roomIds do not belong to this project" },
        { status: 400 },
      );
    }

    // One transaction: create the parent job and all its items together.
    const job = await prisma.estimateJob.create({
      data: {
        projectId,
        totalItems: rooms.length,
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : undefined,
        items: {
          create: rooms.map((r) => {
            const payload: JobItemPayload = {
              roomTemplateId: r.roomTemplateId,
              scopeNarrative: r.scopeNarrative,
              ...(r.squareFootage != null ? { squareFootage: r.squareFootage } : {}),
              ...(r.projectContext ? { projectContext: r.projectContext } : {}),
            };
            return {
              roomId: r.roomId,
              payload: payload as unknown as Prisma.InputJsonValue,
            };
          }),
        },
      },
      include: { items: { select: { id: true } } },
    });

    // Fan out to QStash — each publish is independent, so running them in
    // parallel cuts total request time from O(n * RTT) to O(RTT). If any
    // single publish fails, the job is still valid (other items will run);
    // we surface the failed count in the response so the client can retry.
    const publishResults = await Promise.allSettled(
      job.items.map((it) => publishEstimateWorkerMessage(it.id)),
    );
    const failedItemIds = job.items
      .filter((_, i) => publishResults[i].status === "rejected")
      .map((it) => it.id);
    const publishFailures = failedItemIds.length;

    // LOCAL-DEV inline fallback: if publishing to QStash failed (e.g. the
    // `qstash-cli dev` proxy isn't running), run those items in-process so
    // estimate generation "just works" on localhost without a second terminal.
    // Fire-and-forget — the dev server stays alive to finish them and the client
    // polls progress as usual. NEVER runs in production (a publish failure there
    // is a real error surfaced via `publishFailures`, not something to silently
    // run inline on a serverless function that would freeze after responding).
    let inlineFallback = false;
    if (publishFailures > 0 && process.env.NODE_ENV !== "production") {
      inlineFallback = true;
      void runJobItemsInline(failedItemIds).catch((e) => {
        // eslint-disable-next-line no-console
        console.error("[ai-estimate/bulk] inline dev fallback error:", e);
      });
    }

    return NextResponse.json({
      jobId: job.id,
      totalItems: job.totalItems,
      publishFailures,
      inlineFallback,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-estimate/bulk] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/ai-estimate/bulk?projectId=...
 *
 * Returns the most recent bulk estimate job for a project, or `null` if the
 * project has never had one. Used by the rooms tab's "failed-room retry" bar
 * to decide whether to surface the retry CTA and to enumerate failed items.
 *
 * Intentionally lean — no line-item details, no full items payload. Callers
 * that need per-item drill-down should hit `GET /api/jobs/[id]`.
 */
export async function GET(request: NextRequest) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }
    const job = await prisma.estimateJob.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          where: { status: "FAILED" },
          select: { id: true, roomId: true, error: true },
        },
      },
    });
    if (!job) return NextResponse.json({ job: null });
    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        totalItems: job.totalItems,
        completedItems: job.completedItems,
        failedItems: job.failedItems,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        failedJobItems: job.items.map((i) => ({
          id: i.id,
          roomId: i.roomId,
          error: i.error,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-estimate/bulk] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
