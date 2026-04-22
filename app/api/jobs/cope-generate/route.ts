import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";
import {
  generateProjectOverhead,
  ProjectOverheadError,
} from "@/app/lib/ai/generate-project-overhead";
import type { CopeWorkerPayload } from "@/app/lib/ai/estimate-job";

/**
 * POST /api/jobs/cope-generate
 *
 * Phase 8C: QStash-delivered worker for the project-overhead (COPE) auto-trigger.
 * Fires when an EstimateJob rolls up to COMPLETED AND `CompanySettings.autoGenerateCope`
 * is not explicitly disabled.
 *
 * Lifecycle per invocation:
 *   1. Verify QStash signature (webhook auth).
 *   2. Delegate to `generateProjectOverhead()` — the service acquires its
 *      own `Project.copeStatus` idempotency lock, so repeat deliveries
 *      and rapid-succession triggers are safe.
 *   3. Map `ProjectOverheadError` codes to QStash retry semantics:
 *        - BUSY          -> 200 skipped (another generator holds the lock — don't retry)
 *        - UPSTREAM      -> re-throw (transient; let QStash retry up to 3x)
 *        - NOT_FOUND     -> 200 failed_terminal (service marked FAILED — no point retrying)
 *        - MISCONFIGURED -> 200 failed_terminal (same — requires operator intervention)
 */

// COPE calls stream 60-120s against Anthropic. Without this the worker
// times out on Vercel Pro's 60s default.
export const maxDuration = 300;

async function handler(request: Request): Promise<Response> {
  let body: CopeWorkerPayload | null = null;
  try {
    body = (await request.json()) as CopeWorkerPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const projectId = body?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  try {
    const result = await generateProjectOverhead({ projectId });
    return NextResponse.json({
      status: "completed",
      copeEstimateId: result.copeEstimateId,
      warnings: result.warnings,
    });
  } catch (err) {
    if (err instanceof ProjectOverheadError) {
      if (err.code === "BUSY") {
        // Another generator holds the lock — treat as already-handled.
        // Return 200 so QStash doesn't retry.
        return NextResponse.json({ status: "skipped_busy" }, { status: 200 });
      }
      if (err.code === "UPSTREAM") {
        // Transient failure (Anthropic empty/overloaded/truncated response).
        // Re-throw so QStash retries with exponential backoff.
        // eslint-disable-next-line no-console
        console.warn(
          `[jobs/cope-generate] UPSTREAM for project=${projectId}; re-throwing for QStash retry: ${err.message}`,
        );
        throw err;
      }
      // NOT_FOUND / MISCONFIGURED — the service already marked copeStatus=FAILED.
      // Return 200 so QStash doesn't pointlessly retry a config/setup issue.
      // eslint-disable-next-line no-console
      console.error(
        `[jobs/cope-generate] terminal failure for project=${projectId} code=${err.code}: ${err.message}`,
      );
      return NextResponse.json(
        { status: "failed_terminal", code: err.code, error: err.message },
        { status: 200 },
      );
    }
    // Unknown error — let QStash retry. The service's own catch block has
    // already recorded copeStatus=FAILED if it got that far, but if the
    // failure is outside the service (e.g. the import itself throws), we
    // want visibility.
    throw err;
  }
}

export const POST = verifySignatureAppRouter(handler);
