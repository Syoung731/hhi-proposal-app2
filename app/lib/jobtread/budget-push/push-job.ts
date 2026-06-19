import "server-only";

import { prisma } from "@/app/lib/prisma";
import { getQstashClient } from "@/app/lib/ai/estimate-job";
import { pushBudgetToJob } from "./push-service";
import type { JobTreadBudgetTree } from "./types";

/**
 * Background budget-push job lib — mirrors `app/lib/ai/estimate-job.ts` for the
 * JobTread push. The push modal enqueues a `JobTreadPushJob` (storing the
 * verified tree + target job/linkage + mode); a QStash worker runs it so large
 * budgets don't hit the serverless request timeout. Reuses the shared QStash
 * client from estimate-job.ts so there's one client + env handling.
 */

/** One budget push runs at a time globally (pushes are heavy + serial). */
export const PUSH_FLOW_CONTROL_KEY = "hhi-jobtread-push";

/** Shape the worker route expects as its QStash webhook body. */
export interface PushWorkerPayload {
  pushJobId: string;
}

/** Strip surrounding quotes some `.env` loaders leave on values. */
function unquote(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  if (
    t.length >= 2 &&
    ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/** Absolute URL QStash POSTs the push-worker message to. */
function resolvePushWorkerUrl(): string {
  const base = unquote(process.env.NEXT_PUBLIC_APP_URL);
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set — required to build the JobTread push QStash webhook URL.",
    );
  }
  return `${base.replace(/\/+$/, "")}/api/jobs/jobtread-push`;
}

/** Publish one push-worker message to QStash (parallelism 1 — one push at a time). */
export async function publishPushWorkerMessage(pushJobId: string): Promise<void> {
  const payload: PushWorkerPayload = { pushJobId };
  await getQstashClient().publishJSON({
    url: resolvePushWorkerUrl(),
    body: payload,
    retries: 3,
    flowControl: { key: PUSH_FLOW_CONTROL_KEY, parallelism: 1 },
  });
}

export type ProcessPushJobOutcome =
  | { outcome: "not_found" }
  | { outcome: "skipped"; status: string }
  | { outcome: "completed"; groupCount: number; itemCount: number }
  | { outcome: "failed"; error: string };

/**
 * Run one JobTreadPushJob end-to-end: claim it (QUEUED → RUNNING via a
 * conditional update so duplicate QStash deliveries / retries can't double-push),
 * run the actual budget push with live progress counters, then record
 * COMPLETED / FAILED. `pushBudgetToJob` rolls back its own JobTread writes on
 * failure, so a failed job leaves no orphaned budget.
 *
 * Shared by the QStash worker route AND the local-dev inline fallback so the two
 * paths can never drift.
 */
export async function processPushJob(
  pushJobId: string,
): Promise<ProcessPushJobOutcome> {
  const job = await prisma.jobTreadPushJob.findUnique({ where: { id: pushJobId } });
  if (!job) return { outcome: "not_found" };
  if (job.status === "COMPLETED") return { outcome: "skipped", status: "COMPLETED" };

  // Claim: only one worker may move QUEUED → RUNNING. A duplicate delivery (or a
  // retry while the first is still in flight) finds count 0 and skips — never a
  // double push.
  const claim = await prisma.jobTreadPushJob.updateMany({
    where: { id: pushJobId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date(), error: null },
  });
  if (claim.count === 0) {
    const cur = await prisma.jobTreadPushJob.findUnique({
      where: { id: pushJobId },
      select: { status: true },
    });
    return { outcome: "skipped", status: cur?.status ?? "UNKNOWN" };
  }

  const tree = job.tree as unknown as JobTreadBudgetTree;
  try {
    const res = await pushBudgetToJob(
      job.projectId,
      job.jobtreadJobId,
      tree,
      {
        accountId: job.jobtreadAccountId,
        locationId: job.jobtreadLocationId,
        jobNumber: job.jobtreadJobNumber,
      },
      {
        overwrite: job.mode === "overwrite",
        onProgress: async ({ groups, items }) => {
          await prisma.jobTreadPushJob
            .update({
              where: { id: pushJobId },
              data: { createdGroups: groups, createdItems: items },
            })
            .catch(() => {}); // progress write is best-effort
        },
      },
    );

    await prisma.jobTreadPushJob.update({
      where: { id: pushJobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        createdGroups: res.groupCount,
        createdItems: res.itemCount,
        error: null,
      },
    });
    return { outcome: "completed", groupCount: res.groupCount, itemCount: res.itemCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Push failed.";
    await prisma.jobTreadPushJob
      .update({
        where: { id: pushJobId },
        data: { status: "FAILED", completedAt: new Date(), error: message },
      })
      .catch(() => {});
    return { outcome: "failed", error: message };
  }
}

/**
 * LOCAL-DEV inline fallback. When the QStash proxy isn't reachable on localhost,
 * the start action runs the push in-process here instead — so the push "just
 * works" without a second terminal. Fire-and-forget from the request handler
 * (the dev server stays alive to finish it; the client polls progress as usual).
 * Never used in production.
 */
export async function runPushJobInline(pushJobId: string): Promise<void> {
  await processPushJob(pushJobId);
}
