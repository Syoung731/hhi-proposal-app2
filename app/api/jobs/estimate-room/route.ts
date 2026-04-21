import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  generateRoomEstimate,
  GenerateRoomEstimateError,
} from "@/app/lib/ai/generate-room-estimate";
import {
  MAX_JOB_ITEM_ATTEMPTS,
  rollUpJobStatus,
  type EstimateWorkerPayload,
  type JobItemPayload,
} from "@/app/lib/ai/estimate-job";
import type { ProjectContext } from "@/app/lib/ai-estimate-prompt";

/**
 * POST /api/jobs/estimate-room
 *
 * QStash-delivered worker for a single-room estimate. The bulk trigger
 * creates a `JobItem`, then publishes one of these per room with flow-
 * control so QStash caps in-flight workers at the admin-configured
 * concurrency.
 *
 * Lifecycle per invocation:
 *   1. Verify QStash signature
 *   2. Load JobItem; idempotency short-circuits if already COMPLETED
 *   3. Recovery path: if the item is RUNNING and an AIEstimate already
 *      exists from this item's window, link it and mark COMPLETED —
 *      covers the race where a previous attempt persisted the estimate
 *      but crashed before the JobItem finalisation transaction ran
 *   4. Mark RUNNING + increment `attempts`
 *   5. Call `generateRoomEstimate()` (outside any transaction — it
 *      holds an open Anthropic stream for ~90–120s)
 *   6. Finalise in one transaction: set JobItem COMPLETED + estimateId,
 *      bump parent `completedItems`, run `rollUpJobStatus`
 *
 * Failure handling:
 *   - On thrown error with `attempts < MAX_JOB_ITEM_ATTEMPTS`: re-throw
 *     so QStash retries with its configured backoff
 *   - On thrown error with `attempts >= MAX_JOB_ITEM_ATTEMPTS`: mark
 *     JobItem FAILED, bump parent `failedItems`, rollup, return 200
 *     so QStash does NOT keep retrying a terminal failure
 */

// Vercel cap — single-room estimates routinely run 90–120s against the
// Anthropic API, so the default 10s/60s timeouts will cut them short.
// 300s is the hard ceiling on Vercel Pro.
export const maxDuration = 300;

async function handler(request: Request): Promise<Response> {
  let body: EstimateWorkerPayload | null = null;
  try {
    body = (await request.json()) as EstimateWorkerPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const jobItemId = body?.jobItemId;
  if (!jobItemId) {
    return NextResponse.json({ error: "Missing jobItemId" }, { status: 400 });
  }

  const item = await prisma.jobItem.findUnique({
    where: { id: jobItemId },
    include: { estimateJob: { select: { id: true, projectId: true, startedAt: true } } },
  });
  if (!item) {
    // Unknown item — could be stale QStash delivery after the job was
    // cascade-deleted. Return 200 so QStash stops retrying.
    return NextResponse.json({ status: "not_found" }, { status: 200 });
  }

  // ---------- (2) Idempotency ----------
  if (item.status === "COMPLETED") {
    return NextResponse.json({ status: "already_done", estimateId: item.estimateId });
  }

  // ---------- (3) Recovery from mid-transaction crash ----------
  if (item.status === "RUNNING" && item.startedAt) {
    const orphan = await prisma.aIEstimate.findFirst({
      where: {
        projectId: item.estimateJob.projectId,
        sectionId: item.roomId,
        createdAt: { gte: item.startedAt },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (orphan) {
      await prisma.$transaction(async (tx) => {
        await tx.jobItem.update({
          where: { id: jobItemId },
          data: {
            status: "COMPLETED",
            finishedAt: new Date(),
            estimateId: orphan.id,
            error: null,
          },
        });
        await tx.estimateJob.update({
          where: { id: item.estimateJobId },
          data: { completedItems: { increment: 1 } },
        });
        await rollUpJobStatus(tx, item.estimateJobId);
      });
      return NextResponse.json({ status: "recovered", estimateId: orphan.id });
    }
    // No orphan — the previous attempt failed before creating an estimate.
    // Fall through and re-run.
  }

  // ---------- (4) Mark RUNNING ----------
  // Two updates in one transaction: the item itself, and the parent's
  // `startedAt` on the very first worker to move past QUEUED.
  await prisma.$transaction(async (tx) => {
    await tx.jobItem.update({
      where: { id: jobItemId },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        attempts: { increment: 1 },
        error: null,
      },
    });
    if (!item.estimateJob.startedAt) {
      await tx.estimateJob.update({
        where: { id: item.estimateJobId },
        data: { status: "RUNNING", startedAt: new Date() },
      });
    }
  });

  // The `attempts` field we care about for the terminal-failure check is
  // the POST-increment value; load it back so we know how many attempts
  // including this one have been made.
  const reloaded = await prisma.jobItem.findUnique({
    where: { id: jobItemId },
    select: { attempts: true, payload: true },
  });
  const attemptsSoFar = reloaded?.attempts ?? 1;

  // ---------- (5) Run the estimate ----------
  try {
    const payload = (reloaded?.payload ?? item.payload) as unknown as JobItemPayload;
    if (!payload?.roomTemplateId || typeof payload.scopeNarrative !== "string") {
      throw new GenerateRoomEstimateError(
        "NOT_FOUND",
        `JobItem ${jobItemId} payload missing roomTemplateId or scopeNarrative`,
      );
    }

    const result = await generateRoomEstimate({
      projectId: item.estimateJob.projectId,
      sectionId: item.roomId,
      roomTemplateId: payload.roomTemplateId,
      scopeNarrative: payload.scopeNarrative,
      ...(payload.squareFootage != null ? { squareFootage: payload.squareFootage } : {}),
      ...(payload.projectContext
        ? { projectContext: payload.projectContext as ProjectContext }
        : {}),
    });

    // ---------- (6) Finalise ----------
    await prisma.$transaction(async (tx) => {
      await tx.jobItem.update({
        where: { id: jobItemId },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
          estimateId: result.estimate.id,
          error: null,
        },
      });
      await tx.estimateJob.update({
        where: { id: item.estimateJobId },
        data: { completedItems: { increment: 1 } },
      });
      await rollUpJobStatus(tx, item.estimateJobId);
    });

    return NextResponse.json({
      status: "completed",
      estimateId: result.estimate.id,
      warnings: result.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // eslint-disable-next-line no-console
    console.error(
      `[jobs/estimate-room] item=${jobItemId} attempt=${attemptsSoFar} error:`,
      message,
    );

    if (attemptsSoFar >= MAX_JOB_ITEM_ATTEMPTS) {
      // Terminal failure — mark FAILED, bump parent failedItems, rollup.
      // Return 200 so QStash stops retrying this message.
      await prisma.$transaction(async (tx) => {
        await tx.jobItem.update({
          where: { id: jobItemId },
          data: { status: "FAILED", finishedAt: new Date(), error: message },
        });
        await tx.estimateJob.update({
          where: { id: item.estimateJobId },
          data: { failedItems: { increment: 1 } },
        });
        await rollUpJobStatus(tx, item.estimateJobId);
      });
      return NextResponse.json(
        { status: "failed_terminal", attempts: attemptsSoFar, error: message },
        { status: 200 },
      );
    }

    // Non-terminal failure — reset item to QUEUED so the next QStash
    // retry's RUNNING marker has a clean slate. Record the last error
    // so progress polling can show it transiently.
    await prisma.jobItem.update({
      where: { id: jobItemId },
      data: { status: "QUEUED", error: message, startedAt: null },
    });
    // Re-throw so QStash sees a non-200 and triggers its own retry.
    throw err;
  }
}

export const POST = verifySignatureAppRouter(handler);
