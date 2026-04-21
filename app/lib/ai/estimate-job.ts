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

/** Max times a single JobItem is allowed to attempt before being marked terminal FAILED. */
export const MAX_JOB_ITEM_ATTEMPTS = 3;

/** Shape of what the worker route expects as its QStash webhook body. */
export interface EstimateWorkerPayload {
  jobItemId: string;
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

/**
 * Terminal-state rollup for an EstimateJob, called inside the worker's
 * finalisation transaction. Reads the post-increment counter state and
 * sets a terminal status once every item has landed.
 *
 * Idempotent — if counters don't yet sum to totalItems, this is a no-op.
 * Redundant under concurrent workers (the last worker to finalise will
 * re-execute the same branch), but the writes are idempotent so that's
 * fine.
 */
export async function rollUpJobStatus(
  tx: Prisma.TransactionClient,
  jobId: string,
): Promise<void> {
  const job = await tx.estimateJob.findUnique({
    where: { id: jobId },
    select: { totalItems: true, completedItems: true, failedItems: true, status: true },
  });
  if (!job) return;
  if (job.completedItems + job.failedItems < job.totalItems) return;

  const finalStatus =
    job.failedItems === 0
      ? "COMPLETED"
      : job.failedItems === job.totalItems
        ? "FAILED"
        : "PARTIAL";

  // Skip the write if we'd land on the same terminal state — avoids
  // stomping `completedAt` with a later timestamp under concurrent writers.
  if (job.status === finalStatus) return;

  await tx.estimateJob.update({
    where: { id: jobId },
    data: { status: finalStatus, completedAt: new Date() },
  });
}
