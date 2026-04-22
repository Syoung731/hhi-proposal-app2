import { Client } from "@upstash/qstash";
import type { Prisma } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";
import { getAiEstimateConcurrency } from "@/app/lib/ai/get-ai-estimate-concurrency";

/**
 * Shared QStash + job-rollup helpers used by the bulk trigger, worker, and
 * retry routes. Keeping these in one module avoids drift between the fan-out
 * path and the retry path — both publish via the same helper with the same
 * flowControl key.
 */

/** Stable key for QStash flow-control — all estimate-room messages share this key so parallelism is capped globally across every bulk job in flight. */
export const FLOW_CONTROL_KEY = "hhi-estimate-worker";

/**
 * Phase 8C — stable flow-control key for COPE worker messages. Parallelism
 * is capped at 1 globally (matches `Project.copeStatus` lock semantics: one
 * COPE per project at a time; serialising across projects is a mild safety
 * net — concurrent COPE generations for different projects are fine but we
 * don't benefit from running them in parallel since each is only one call).
 */
export const COPE_FLOW_CONTROL_KEY = "hhi-cope-worker";

/** Max times a single JobItem is allowed to attempt before being marked terminal FAILED. */
export const MAX_JOB_ITEM_ATTEMPTS = 3;

/** Shape of what the worker route expects as its QStash webhook body. */
export interface EstimateWorkerPayload {
  jobItemId: string;
}

/** Shape of what the Phase 8C COPE worker expects as its QStash webhook body. */
export interface CopeWorkerPayload {
  projectId: string;
  /** Optional audit — which EstimateJob completion triggered this (null for manual fires). */
  triggeredByJobId?: string | null;
}

/** Shape stored in `JobItem.payload` — enough to drive `generateRoomEstimate()` without re-fetching request-time state. */
export interface JobItemPayload {
  roomTemplateId: string;
  scopeNarrative: string;
  squareFootage?: number;
  projectContext?: {
    propertyType?: string;
    constructionEra?: string;
    existingCondition?: string;
    occupiedDuringWork?: boolean;
    specialConditions?: string;
  };
}

/**
 * Strip surrounding single/double quotes that some `.env` loaders leave on
 * values (e.g. dotenv-cli passes `QSTASH_URL="http://..."` through with the
 * literal quotes). Applied to every env var we read in this module so a
 * quoted value doesn't silently break URL parsing inside the QStash client.
 */
function sanitizeEnv(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * Build the absolute URL QStash should POST to when delivering a message.
 * Prefers `NEXT_PUBLIC_APP_URL` (set for both local dev + Vercel deploys);
 * throws at call time rather than publish-ready misconfiguration silently.
 */
function resolveWorkerUrl(): string {
  const base = sanitizeEnv(process.env.NEXT_PUBLIC_APP_URL);
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set — required to build QStash webhook URL. Set it in .env.local / Vercel env.",
    );
  }
  return `${base.replace(/\/+$/, "")}/api/jobs/estimate-room`;
}

/** Lazy QStash client — instantiated on first publish so boot doesn't fail when env is missing (e.g. during `next build`). */
let qstashClient: Client | null = null;
function getQstashClient(): Client {
  if (qstashClient) return qstashClient;
  const token = sanitizeEnv(process.env.QSTASH_TOKEN);
  if (!token) {
    throw new Error(
      "QSTASH_TOKEN is not set — required for estimate job fan-out. Set it in .env.local / Vercel env.",
    );
  }
  const baseUrl = sanitizeEnv(process.env.QSTASH_URL);
  qstashClient = new Client({ token, ...(baseUrl ? { baseUrl } : {}) });
  return qstashClient;
}

/**
 * Publish one estimate-room message to QStash.
 *
 * Uses flow-control (key + parallelism) so QStash itself caps how many
 * messages are in-flight against the worker URL at any moment — no need
 * for a client-side semaphore. The parallelism value is read fresh from
 * `CompanySettings` (cached 60s in-memory; see `getAiEstimateConcurrency`).
 */
export async function publishEstimateWorkerMessage(jobItemId: string): Promise<void> {
  const url = resolveWorkerUrl();
  const parallelism = await getAiEstimateConcurrency();
  const payload: EstimateWorkerPayload = { jobItemId };

  await getQstashClient().publishJSON({
    url,
    body: payload,
    retries: 3,
    flowControl: {
      key: FLOW_CONTROL_KEY,
      parallelism,
    },
  });
}

/** Build the absolute URL for the Phase 8C COPE worker webhook. */
function resolveCopeWorkerUrl(): string {
  const base = sanitizeEnv(process.env.NEXT_PUBLIC_APP_URL);
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set — required to build the COPE QStash webhook URL.",
    );
  }
  return `${base.replace(/\/+$/, "")}/api/jobs/cope-generate`;
}

/**
 * Publish one `cope-generate` message to QStash. Capped at parallelism=1 via
 * `COPE_FLOW_CONTROL_KEY` — that's a belt-and-suspenders over the `Project.copeStatus`
 * lock inside `generateProjectOverhead()`, not a functional requirement.
 */
export async function publishCopeGenerateMessage(
  projectId: string,
  triggeredByJobId: string | null = null,
): Promise<void> {
  const url = resolveCopeWorkerUrl();
  const payload: CopeWorkerPayload = { projectId, triggeredByJobId };
  await getQstashClient().publishJSON({
    url,
    body: payload,
    retries: 3,
    flowControl: {
      key: COPE_FLOW_CONTROL_KEY,
      parallelism: 1,
    },
  });
}

/**
 * Auto-trigger entry point — called from the estimate-room worker after the
 * finalisation transaction commits, ONLY when `rollUpJobStatus` returned
 * "COMPLETED" (never PARTIAL or FAILED).
 *
 * Reads `CompanySettings.autoGenerateCope`; if enabled (default true),
 * publishes a single COPE worker message. Publish failures are logged but
 * swallowed — the manual button is the fallback, so a QStash outage shouldn't
 * cascade into a worker 500 that leaves the EstimateJob in a weird state.
 */
export async function maybeAutoTriggerCope(
  projectId: string,
  triggeredByJobId: string,
): Promise<{ published: boolean; reason: string }> {
  try {
    const settings = await prisma.companySettings.findFirst({
      select: { autoGenerateCope: true },
    });
    // Default is `true` at the schema level; explicit `false` in settings disables.
    if (settings?.autoGenerateCope === false) {
      return { published: false, reason: "autoGenerateCope_disabled" };
    }
    await publishCopeGenerateMessage(projectId, triggeredByJobId);
    return { published: true, reason: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    // eslint-disable-next-line no-console
    console.error(
      `[cope-auto-trigger] publish failed for project=${projectId} job=${triggeredByJobId}: ${message}`,
    );
    return { published: false, reason: `publish_error:${message}` };
  }
}

/**
 * Terminal-state rollup for an EstimateJob, called inside the worker's
 * finalisation transaction. Reads the post-increment counter state and
 * sets a terminal status once every item has landed.
 *
 * Returns the new terminal status IFF this call actually wrote it; returns
 * `null` otherwise (not yet terminal, or another worker already wrote the
 * same terminal state). The return value is load-bearing for Phase 8C:
 * the caller uses it to decide whether to fire the COPE auto-trigger, and
 * returning only on the *changing* transition ensures auto-fire runs once.
 *
 * Existing callers that ignore the return value are backward-compatible.
 */
export async function rollUpJobStatus(
  tx: Prisma.TransactionClient,
  jobId: string,
): Promise<"COMPLETED" | "PARTIAL" | "FAILED" | null> {
  const job = await tx.estimateJob.findUnique({
    where: { id: jobId },
    select: { totalItems: true, completedItems: true, failedItems: true, status: true },
  });
  if (!job) return null;
  if (job.completedItems + job.failedItems < job.totalItems) return null;

  const finalStatus =
    job.failedItems === 0
      ? "COMPLETED"
      : job.failedItems === job.totalItems
        ? "FAILED"
        : "PARTIAL";

  // Skip the write if we'd land on the same terminal state — avoids
  // stomping `completedAt` with a later timestamp under concurrent writers.
  if (job.status === finalStatus) return null;

  await tx.estimateJob.update({
    where: { id: jobId },
    data: { status: finalStatus, completedAt: new Date() },
  });
  return finalStatus;
}
