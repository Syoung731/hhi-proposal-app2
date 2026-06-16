import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";
import {
  processEstimateJobItem,
  type EstimateWorkerPayload,
} from "@/app/lib/ai/estimate-job";

/**
 * POST /api/jobs/estimate-room
 *
 * QStash-delivered worker for a single-room estimate. The bulk trigger creates a
 * `JobItem`, then publishes one of these per room with flow-control so QStash
 * caps in-flight workers at the admin-configured concurrency.
 *
 * The full per-item lifecycle (idempotency, crash-recovery, RUNNING/attempts,
 * generateRoomEstimate, finalise + rollup + COPE auto-trigger) lives in the
 * SHARED `processEstimateJobItem()` so this route and the local-dev inline
 * fallback can never drift. This route just verifies the QStash signature, maps
 * the outcome to a Response, and re-throws on a retryable failure so QStash
 * retries with its configured backoff.
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

  const result = await processEstimateJobItem(jobItemId);
  switch (result.outcome) {
    case "not_found":
      // Stale delivery after the job was cascade-deleted — 200 so QStash stops.
      return NextResponse.json({ status: "not_found" }, { status: 200 });
    case "already_done":
      return NextResponse.json({ status: "already_done", estimateId: result.estimateId });
    case "recovered":
      return NextResponse.json({ status: "recovered", estimateId: result.estimateId });
    case "completed":
      return NextResponse.json({
        status: "completed",
        estimateId: result.estimateId,
        warnings: result.warnings,
        copeAutoTriggered: result.copeAutoTriggered,
      });
    case "failed_terminal":
      // 200 so QStash does NOT keep retrying a terminal failure.
      return NextResponse.json(
        { status: "failed_terminal", attempts: result.attempts, error: result.error },
        { status: 200 },
      );
    case "failed_retryable":
      // Throw → non-200 → QStash retries with backoff.
      throw new Error(result.error);
  }
}

export const POST = verifySignatureAppRouter(handler);
