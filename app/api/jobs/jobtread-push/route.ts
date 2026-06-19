import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";
import {
  processPushJob,
  type PushWorkerPayload,
} from "@/app/lib/jobtread/budget-push/push-job";

/**
 * POST /api/jobs/jobtread-push
 *
 * QStash-delivered worker for the background budget push. Runs one
 * `JobTreadPushJob` end-to-end via `processPushJob` (which claims it, pushes the
 * stored tree with live progress, and records COMPLETED/FAILED).
 *
 * Always returns 200 — the job's own status is the source of truth. We do NOT
 * re-throw to trigger a QStash retry: `processPushJob`'s QUEUED→RUNNING claim
 * guard already prevents concurrent double-pushes, and auto-retrying a FAILED
 * push is undesirable (the push service already rolled back its writes; the user
 * retries manually from the modal).
 */

// A whole-home budget pushes serially over many JobTread calls — without this it
// times out on Vercel Pro's 60s default.
export const maxDuration = 300;

async function handler(request: Request): Promise<Response> {
  let body: PushWorkerPayload | null = null;
  try {
    body = (await request.json()) as PushWorkerPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const pushJobId = body?.pushJobId;
  if (!pushJobId) {
    return NextResponse.json({ error: "Missing pushJobId" }, { status: 400 });
  }

  const result = await processPushJob(pushJobId);
  return NextResponse.json(result, { status: 200 });
}

export const POST = verifySignatureAppRouter(handler);
