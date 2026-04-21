// Phase 8B backend smoke test: exercises bulk trigger, QStash fan-out,
// worker processing, progress polling, idempotency, failure path, and retry.
//
// Run after dev server + `npx @upstash/qstash-cli dev` are both running:
//   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/smoke/bulk-job.ts
import { prisma } from "../../app/lib/prisma";
import { publishEstimateWorkerMessage } from "../../app/lib/ai/estimate-job";

const BASE = "http://localhost:3000";
const PROJECT_ID = "cmo8mgpn20006o47kjvop2zlj";
const TEMPLATE_ID = "cmnf4d3p916dbew7knteol76o"; // Standard Room
// 3 closets — smaller scope, faster Claude responses than bedrooms/kitchens.
const ROOMS = [
  "cmo8mm54g000oo47kjxlj1640", // Primary Closet 1
  "cmo8mm54g000po47k2z2w8t2u", // Primary Closet 2
  "cmo8mm54g000to47kg01i6bbh", // Bedroom 2 Closet
];

type JobResponse = {
  id: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  startedAt: string | null;
  completedAt: string | null;
  items: Array<{
    id: string;
    roomId: string;
    roomName: string;
    status: string;
    attempts: number;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
    estimateId: string | null;
  }>;
};

async function getJob(jobId: string): Promise<JobResponse> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error(`GET /api/jobs/${jobId} -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<JobResponse>;
}

async function pollUntilTerminal(jobId: string, timeoutMs = 10 * 60_000): Promise<JobResponse> {
  const start = Date.now();
  let last: JobResponse | null = null;
  while (Date.now() - start < timeoutMs) {
    const job = await getJob(jobId);
    last = job;
    process.stdout.write(
      `  [${((Date.now() - start) / 1000).toFixed(1)}s] status=${job.status} done=${job.completedItems}/${job.totalItems} failed=${job.failedItems}\n`,
    );
    if (job.status === "COMPLETED" || job.status === "PARTIAL" || job.status === "FAILED") return job;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Timeout after ${timeoutMs}ms; last=${JSON.stringify(last)}`);
}

async function main() {
  let failures = 0;
  const note = (ok: boolean, label: string) => {
    process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${label}\n`);
    if (!ok) failures++;
  };

  // ---------- Phase 1: Load room scopes ----------
  const rows = await prisma.room.findMany({
    where: { id: { in: ROOMS } },
    select: { id: true, name: true, scopeNarrative: true },
  });
  process.stdout.write(`\n=== Phase 1: rooms ===\n`);
  for (const r of rows) {
    process.stdout.write(`  ${r.id} | ${r.name} | ${r.scopeNarrative.length}c\n`);
  }

  // ---------- Phase 2: Bulk kickoff ----------
  process.stdout.write(`\n=== Phase 2: POST /api/ai-estimate/bulk ===\n`);
  const kickoffStart = Date.now();
  const res = await fetch(`${BASE}/api/ai-estimate/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      rooms: rows.map((r) => ({
        roomId: r.id,
        roomTemplateId: TEMPLATE_ID,
        scopeNarrative: r.scopeNarrative,
      })),
      metadata: { source: "smoke-test" },
    }),
  });
  const kickoffMs = Date.now() - kickoffStart;
  if (!res.ok) {
    process.stdout.write(`  POST failed: ${res.status} ${await res.text()}\n`);
    process.exit(1);
  }
  const kick = (await res.json()) as { jobId: string; totalItems: number; publishFailures: number };
  process.stdout.write(`  jobId=${kick.jobId} totalItems=${kick.totalItems} publishFailures=${kick.publishFailures} kickoffTime=${kickoffMs}ms\n`);
  note(kick.totalItems === 3, "bulk route returned totalItems=3");
  note(kick.publishFailures === 0, "all 3 QStash publishes succeeded");
  note(kickoffMs < 2000, `kickoff completed in <2s (actual ${kickoffMs}ms)`);

  // ---------- Phase 3: Poll until terminal ----------
  process.stdout.write(`\n=== Phase 3: poll GET /api/jobs/${kick.jobId} ===\n`);
  const pollStart = Date.now();
  const finalJob = await pollUntilTerminal(kick.jobId);
  const totalMs = Date.now() - pollStart;
  process.stdout.write(`  terminal status=${finalJob.status} elapsed=${(totalMs / 1000).toFixed(1)}s\n`);
  note(finalJob.status === "COMPLETED", "job reached COMPLETED (no failures)");
  note(finalJob.completedItems === 3, "3 items COMPLETED");
  note(finalJob.failedItems === 0, "0 items FAILED");

  // Verify 3 AIEstimate rows created for this job
  const estimateIds = finalJob.items.map((i) => i.estimateId).filter(Boolean) as string[];
  const estimates = await prisma.aIEstimate.findMany({ where: { id: { in: estimateIds } }, select: { id: true } });
  note(estimates.length === 3, `3 AIEstimate rows linked from JobItems (found ${estimates.length})`);

  // ---------- Phase 4: Parallelism confirmation ----------
  process.stdout.write(`\n=== Phase 4: parallelism check (startedAt spread) ===\n`);
  const startedAts = finalJob.items
    .map((i) => i.startedAt)
    .filter(Boolean)
    .map((s) => new Date(s!).getTime())
    .sort((a, b) => a - b);
  const spreadMs = startedAts.length >= 2 ? startedAts[startedAts.length - 1]! - startedAts[0]! : 0;
  for (const i of finalJob.items) {
    process.stdout.write(`  ${i.roomName}: startedAt=${i.startedAt} finishedAt=${i.finishedAt} attempts=${i.attempts}\n`);
  }
  process.stdout.write(`  spread first to last startedAt: ${(spreadMs / 1000).toFixed(2)}s\n`);
  note(spreadMs < 5000, `all 3 items started within 5s of each other (actual ${spreadMs}ms) - parallel not sequential`);

  // ---------- Phase 5: Idempotency ----------
  process.stdout.write(`\n=== Phase 5: idempotency (re-publish COMPLETED item) ===\n`);
  const targetItem = finalJob.items[0]!;
  const estimatesBefore = await prisma.aIEstimate.count({ where: { projectId: PROJECT_ID, sectionId: targetItem.roomId } });
  const itemBefore = await prisma.jobItem.findUnique({ where: { id: targetItem.id }, select: { estimateId: true, attempts: true, status: true } });
  process.stdout.write(`  before: status=${itemBefore?.status} estimateId=${itemBefore?.estimateId} attempts=${itemBefore?.attempts} estimatesForRoom=${estimatesBefore}\n`);
  await publishEstimateWorkerMessage(targetItem.id);
  // Wait ~8s for dev proxy to deliver.
  await new Promise((r) => setTimeout(r, 8000));
  const itemAfter = await prisma.jobItem.findUnique({ where: { id: targetItem.id }, select: { estimateId: true, attempts: true, status: true } });
  const estimatesAfter = await prisma.aIEstimate.count({ where: { projectId: PROJECT_ID, sectionId: targetItem.roomId } });
  process.stdout.write(`  after:  status=${itemAfter?.status} estimateId=${itemAfter?.estimateId} attempts=${itemAfter?.attempts} estimatesForRoom=${estimatesAfter}\n`);
  note(itemAfter?.status === "COMPLETED", "item still COMPLETED after idempotent re-delivery");
  note(itemAfter?.estimateId === itemBefore?.estimateId, "estimateId unchanged");
  note(itemAfter?.attempts === itemBefore?.attempts, `attempts unchanged (still ${itemAfter?.attempts})`);
  note(estimatesAfter === estimatesBefore, "no duplicate AIEstimate created");

  // ---------- Phase 6: Failure path + retry ----------
  process.stdout.write(`\n=== Phase 6: failure path + retry ===\n`);
  // Create a JobItem with bad payload (missing roomTemplateId) to force failure.
  const badJob = await prisma.estimateJob.create({
    data: {
      projectId: PROJECT_ID,
      totalItems: 1,
      items: {
        create: [{
          roomId: ROOMS[0]!,
          payload: { scopeNarrative: "Bad payload for smoke test" } as object,
        }],
      },
    },
    include: { items: { select: { id: true } } },
  });
  const badItemId = badJob.items[0]!.id;
  process.stdout.write(`  created bad job=${badJob.id} item=${badItemId}\n`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    await publishEstimateWorkerMessage(badItemId);
    const waitStart = Date.now();
    let current: { status: string; attempts: number; error: string | null } | null = null;
    while (Date.now() - waitStart < 20_000) {
      await new Promise((r) => setTimeout(r, 1500));
      current = await prisma.jobItem.findUnique({
        where: { id: badItemId },
        select: { status: true, attempts: true, error: true },
      });
      if (current && current.status !== "RUNNING") break;
    }
    process.stdout.write(`  attempt ${attempt}: status=${current?.status} attempts=${current?.attempts} error=${(current?.error ?? "").slice(0, 80)}\n`);
  }
  const badFinal = await prisma.jobItem.findUnique({ where: { id: badItemId }, select: { status: true, attempts: true, error: true } });
  const badJobFinal = await prisma.estimateJob.findUnique({ where: { id: badJob.id }, select: { status: true, failedItems: true, completedItems: true } });
  note(badFinal?.status === "FAILED", `bad item landed FAILED (got ${badFinal?.status})`);
  note(badFinal?.attempts === 3, `attempts=3 (got ${badFinal?.attempts})`);
  note(badJobFinal?.status === "FAILED", `single-item job rolls up to FAILED (got ${badJobFinal?.status})`);

  // Retry endpoint
  process.stdout.write(`\n  POST /api/jobs/${badJob.id}/items/${badItemId}/retry\n`);
  const retryRes = await fetch(`${BASE}/api/jobs/${badJob.id}/items/${badItemId}/retry`, { method: "POST" });
  const retryBody = (await retryRes.json().catch(() => null)) as unknown;
  process.stdout.write(`  retry response: ${retryRes.status} ${JSON.stringify(retryBody)}\n`);
  note(retryRes.ok, `retry endpoint returned 200 (got ${retryRes.status})`);
  // Brief pause, then inspect item + parent state.
  await new Promise((r) => setTimeout(r, 1500));
  const afterRetry = await prisma.jobItem.findUnique({ where: { id: badItemId }, select: { status: true, attempts: true, error: true } });
  const jobAfterRetry = await prisma.estimateJob.findUnique({ where: { id: badJob.id }, select: { status: true, failedItems: true, completedAt: true } });
  process.stdout.write(`  item after retry: status=${afterRetry?.status} attempts=${afterRetry?.attempts}\n`);
  process.stdout.write(`  job after retry:  status=${jobAfterRetry?.status} failedItems=${jobAfterRetry?.failedItems} completedAt=${jobAfterRetry?.completedAt}\n`);
  // After retry published, the worker may already have re-run and re-failed the bad item.
  // Accept any of: QUEUED (not yet picked up), RUNNING (in flight), or FAILED again (terminal).
  const allowed = new Set(["QUEUED", "RUNNING", "FAILED"]);
  note(afterRetry != null && allowed.has(afterRetry.status), `item re-queued or already in-flight/re-failed (got ${afterRetry?.status})`);
  const parentReopened =
    jobAfterRetry?.status === "RUNNING" ||
    jobAfterRetry?.status === "QUEUED" ||
    (afterRetry?.status === "FAILED" && jobAfterRetry?.status === "FAILED");
  note(parentReopened === true, `parent job state consistent with retry (got ${jobAfterRetry?.status})`);

  // Clean up
  await prisma.estimateJob.delete({ where: { id: badJob.id } });

  process.stdout.write(`\n=== SUMMARY: ${failures === 0 ? "ALL PASS" : `${failures} FAILURES`} ===\n`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
