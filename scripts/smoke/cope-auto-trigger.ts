// Phase 8C backend smoke test: exercises COPE auto-trigger, manual override,
// PARTIAL skip, idempotency lock, extended polling payload, and failure recovery.
//
// Prereqs (same as bulk-job.ts):
//   - Dev server running on :3000 (restart after Part B code changes)
//   - `npx @upstash/qstash-cli dev` running as the webhook proxy
//   - .env.local with QSTASH_* + NEXT_PUBLIC_APP_URL set
//
// Run: npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/smoke/cope-auto-trigger.ts
import { prisma } from "../../app/lib/prisma";
import { publishEstimateWorkerMessage } from "../../app/lib/ai/estimate-job";

const BASE = "http://localhost:3000";
const PROJECT_ID = "cmo8mgpn20006o47kjvop2zlj"; // Oyster Reef dev project
const TEMPLATE_ID = "cmnf4d3p916dbew7knteol76o"; // Standard Room
const CLOSET_IDS = [
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
  items: Array<{ id: string; status: string; attempts: number }>;
  project: {
    id: string;
    title: string;
    copeStatus: "IDLE" | "GENERATING" | "READY" | "FAILED";
    copeGeneratedAt: string | null;
    copeError: string | null;
  };
};

async function getJob(jobId: string): Promise<JobResponse> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error(`GET /api/jobs/${jobId} -> ${res.status}`);
  return (await res.json()) as JobResponse;
}

async function pollJobUntil(
  jobId: string,
  predicate: (j: JobResponse) => boolean,
  timeoutMs = 10 * 60_000,
  label = "job",
): Promise<JobResponse> {
  const start = Date.now();
  let last: JobResponse | null = null;
  while (Date.now() - start < timeoutMs) {
    const job = await getJob(jobId);
    last = job;
    process.stdout.write(
      `  [${((Date.now() - start) / 1000).toFixed(1)}s] ${label}: status=${job.status} done=${job.completedItems}/${job.totalItems} failed=${job.failedItems} copeStatus=${job.project.copeStatus}\n`,
    );
    if (predicate(job)) return job;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Timeout after ${timeoutMs}ms waiting on ${label}; last=${JSON.stringify(last?.status)}`);
}

async function getProject() {
  return prisma.project.findUnique({
    where: { id: PROJECT_ID },
    select: { copeStatus: true, copeGeneratedAt: true, copeError: true },
  });
}

async function resetCopeState() {
  await prisma.project.update({
    where: { id: PROJECT_ID },
    data: { copeStatus: "IDLE", copeError: null },
  });
}

async function setAutoGenerateCope(enabled: boolean) {
  // Ensure a singleton row exists.
  const existing = await prisma.companySettings.findFirst({ select: { id: true } });
  if (existing) {
    await prisma.companySettings.update({
      where: { id: existing.id },
      data: { autoGenerateCope: enabled },
    });
  } else {
    await prisma.companySettings.create({ data: { autoGenerateCope: enabled } });
  }
}

async function copeAIEstimateCountForProject(): Promise<number> {
  const copeRoom = await prisma.room.findFirst({
    where: { projectId: PROJECT_ID, isProjectOverhead: true },
    select: { id: true },
  });
  if (!copeRoom) return 0;
  return prisma.aIEstimate.count({ where: { projectId: PROJECT_ID, sectionId: copeRoom.id } });
}

async function kickOffBulk(): Promise<{ jobId: string; totalItems: number }> {
  const rooms = await prisma.room.findMany({
    where: { id: { in: CLOSET_IDS } },
    select: { id: true, scopeNarrative: true },
  });
  const res = await fetch(`${BASE}/api/ai-estimate/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      rooms: rooms.map((r) => ({
        roomId: r.id,
        roomTemplateId: TEMPLATE_ID,
        scopeNarrative: r.scopeNarrative,
      })),
      metadata: { source: "phase-8c-smoke" },
    }),
  });
  if (!res.ok) throw new Error(`bulk kickoff failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { jobId: string; totalItems: number };
}

async function main() {
  let failures = 0;
  const note = (ok: boolean, label: string) => {
    process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${label}\n`);
    if (!ok) failures++;
  };

  // ================================================================
  // Test 1: Happy-path auto-trigger (autoGenerateCope ON)
  // ================================================================
  process.stdout.write(`\n=== Test 1: happy-path auto-trigger ===\n`);
  await setAutoGenerateCope(true);
  await resetCopeState();
  const copeCountBefore = await copeAIEstimateCountForProject();

  const kick = await kickOffBulk();
  process.stdout.write(`  kicked off jobId=${kick.jobId} totalItems=${kick.totalItems}\n`);

  // Phase 1: wait for EstimateJob to reach COMPLETED.
  const t1Start = Date.now();
  const jobCompleted = await pollJobUntil(
    kick.jobId,
    (j) => j.status === "COMPLETED" || j.status === "PARTIAL" || j.status === "FAILED",
    12 * 60_000,
    "estimates",
  );
  const estimatesMs = Date.now() - t1Start;
  note(jobCompleted.status === "COMPLETED", `estimates job reached COMPLETED (got ${jobCompleted.status})`);

  // Phase 2: wait for project.copeStatus to go READY (auto-trigger fired + worker finished).
  const t2Start = Date.now();
  const jobWithCope = await pollJobUntil(
    kick.jobId,
    (j) => j.project.copeStatus === "READY" || j.project.copeStatus === "FAILED",
    8 * 60_000,
    "cope",
  );
  const copeMs = Date.now() - t2Start;
  note(jobWithCope.project.copeStatus === "READY", `project.copeStatus=READY (got ${jobWithCope.project.copeStatus})`);
  note(jobWithCope.project.copeGeneratedAt != null, "copeGeneratedAt populated");
  note(jobWithCope.project.copeError == null, `copeError null (got ${JSON.stringify(jobWithCope.project.copeError)})`);

  // Exactly ONE new COPE AIEstimate row
  const copeCountAfter = await copeAIEstimateCountForProject();
  note(copeCountAfter === copeCountBefore + 1, `COPE AIEstimate rows: ${copeCountBefore} -> ${copeCountAfter} (expected +1)`);

  process.stdout.write(`  timings: estimates=${(estimatesMs / 1000).toFixed(1)}s, cope=${(copeMs / 1000).toFixed(1)}s, total=${((estimatesMs + copeMs) / 1000).toFixed(1)}s\n`);

  // ================================================================
  // Test 5 (piggyback): polling payload shape
  // ================================================================
  process.stdout.write(`\n=== Test 5: extended polling payload ===\n`);
  const jobRaw = await (await fetch(`${BASE}/api/jobs/${kick.jobId}`)).json() as Record<string, unknown>;
  const project = jobRaw.project as { copeStatus?: string; copeGeneratedAt?: string; copeError?: unknown } | undefined;
  note(project != null, "GET /api/jobs/:id response has `project` field");
  note(typeof project?.copeStatus === "string", `project.copeStatus is present (got ${typeof project?.copeStatus})`);
  note("copeGeneratedAt" in (project ?? {}), "project.copeGeneratedAt key present");
  note("copeError" in (project ?? {}), "project.copeError key present");

  // ================================================================
  // Test 2: autoGenerateCope OFF
  // ================================================================
  process.stdout.write(`\n=== Test 2: autoGenerateCope OFF ===\n`);
  await setAutoGenerateCope(false);
  // Reset to READY (matches the natural state post-Test-1) so we can detect any unintended transition.
  await prisma.project.update({
    where: { id: PROJECT_ID },
    data: { copeStatus: "READY", copeError: null },
  });
  const beforeProj = await getProject();
  const beforeCopeCount = await copeAIEstimateCountForProject();

  const kick2 = await kickOffBulk();
  process.stdout.write(`  kicked off jobId=${kick2.jobId}\n`);
  await pollJobUntil(
    kick2.jobId,
    (j) => j.status === "COMPLETED" || j.status === "PARTIAL" || j.status === "FAILED",
    12 * 60_000,
    "estimates-2",
  );

  // Give any delayed QStash delivery 15s to show up — then verify NO transition happened.
  process.stdout.write(`  grace window (15s) for any unintended QStash delivery...\n`);
  await new Promise((r) => setTimeout(r, 15_000));

  const afterProj = await getProject();
  const afterCopeCount = await copeAIEstimateCountForProject();
  note(afterProj?.copeStatus === beforeProj?.copeStatus, `copeStatus unchanged (${beforeProj?.copeStatus} -> ${afterProj?.copeStatus})`);
  note(afterProj?.copeGeneratedAt?.getTime() === beforeProj?.copeGeneratedAt?.getTime(), `copeGeneratedAt unchanged (${beforeProj?.copeGeneratedAt?.toISOString()} -> ${afterProj?.copeGeneratedAt?.toISOString()})`);
  note(afterCopeCount === beforeCopeCount, `no new COPE AIEstimate row (count ${beforeCopeCount} -> ${afterCopeCount})`);

  // Now verify manual trigger still works with auto OFF.
  process.stdout.write(`  manual POST /api/cope-estimate (auto still OFF)\n`);
  await prisma.project.update({ where: { id: PROJECT_ID }, data: { copeStatus: "IDLE" } });
  const manualRes = await fetch(`${BASE}/api/cope-estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: PROJECT_ID }),
  });
  note(manualRes.ok, `manual POST succeeded (got ${manualRes.status})`);
  const postManual = await getProject();
  note(postManual?.copeStatus === "READY", `copeStatus=READY after manual call (got ${postManual?.copeStatus})`);

  // Restore auto ON for downstream tests + default.
  await setAutoGenerateCope(true);

  // ================================================================
  // Test 3: PARTIAL skip
  // ================================================================
  process.stdout.write(`\n=== Test 3: PARTIAL job should NOT fire auto-trigger ===\n`);
  // Build a synthetic EstimateJob with totalItems=2 — one already-completed,
  // one designed to fail. When the failing one lands FAILED, rollup → PARTIAL
  // and NO auto-trigger should be published.
  //
  // Avoids burning Anthropic tokens by using an already-completed JobItem.
  const priorEstimate = await prisma.aIEstimate.findFirst({
    where: { projectId: PROJECT_ID, sectionId: CLOSET_IDS[0]! },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!priorEstimate) {
    throw new Error("Test 3 requires a prior AIEstimate on the first closet — run Test 1 first.");
  }
  // Pre-seed `attempts: 2` on the bad item so a single QStash delivery
  // drives it terminal — avoids the race where multiple in-flight deliveries
  // (manual publishes overlapping with QStash's own retries under the worker's
  // re-throw path) double-increment `failedItems` and roll up to FAILED
  // instead of PARTIAL.
  const partialJob = await prisma.estimateJob.create({
    data: {
      projectId: PROJECT_ID,
      totalItems: 2,
      completedItems: 1,
      status: "RUNNING",
      items: {
        create: [
          {
            roomId: CLOSET_IDS[0]!,
            status: "COMPLETED",
            estimateId: priorEstimate.id,
            startedAt: new Date(),
            finishedAt: new Date(),
            payload: {} as object,
          },
          {
            roomId: CLOSET_IDS[1]!,
            status: "QUEUED",
            attempts: 2, // next delivery will be attempt 3 = terminal
            // Intentionally broken payload (missing roomTemplateId).
            payload: { scopeNarrative: "bad payload for PARTIAL smoke" } as object,
          },
        ],
      },
    },
    include: { items: { select: { id: true, status: true } } },
  });
  const badItem = partialJob.items.find((i) => i.status === "QUEUED")!;
  await prisma.project.update({ where: { id: PROJECT_ID }, data: { copeStatus: "READY" } });
  const t3Before = await getProject();

  // Single publish — attempts goes 2 -> 3 -> terminal FAILED path.
  await publishEstimateWorkerMessage(badItem.id);
  // Wait for the worker to process + commit the terminal-failure tx.
  const waitStart = Date.now();
  while (Date.now() - waitStart < 30_000) {
    await new Promise((r) => setTimeout(r, 1500));
    const cur = await prisma.jobItem.findUnique({
      where: { id: badItem.id },
      select: { status: true, attempts: true },
    });
    if (cur?.status === "FAILED") break;
  }
  // Extra 10s grace for any spurious cope-generate QStash delivery to land.
  await new Promise((r) => setTimeout(r, 10_000));

  const partialFinal = await prisma.estimateJob.findUnique({
    where: { id: partialJob.id },
    select: { status: true, completedItems: true, failedItems: true },
  });
  const t3After = await getProject();
  note(partialFinal?.status === "PARTIAL", `synthetic job rolled up to PARTIAL (got ${partialFinal?.status})`);
  note(t3After?.copeStatus === t3Before?.copeStatus, `copeStatus unchanged on PARTIAL (${t3Before?.copeStatus} -> ${t3After?.copeStatus})`);
  note(t3After?.copeGeneratedAt?.getTime() === t3Before?.copeGeneratedAt?.getTime(), "copeGeneratedAt unchanged on PARTIAL");

  // Cleanup.
  await prisma.estimateJob.delete({ where: { id: partialJob.id } });

  // ================================================================
  // Test 4: idempotency lock
  // ================================================================
  process.stdout.write(`\n=== Test 4: idempotency lock (409 BUSY) ===\n`);
  // Hold the lock manually, then attempt a second trigger.
  await prisma.project.update({ where: { id: PROJECT_ID }, data: { copeStatus: "GENERATING" } });
  const busyRes = await fetch(`${BASE}/api/cope-estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: PROJECT_ID }),
  });
  const busyBody = (await busyRes.json().catch(() => null)) as { error?: string; code?: string } | null;
  note(busyRes.status === 409, `BUSY response returned 409 (got ${busyRes.status})`);
  note(busyBody?.code === "BUSY", `error.code is "BUSY" (got ${busyBody?.code})`);
  // Release the lock for downstream tests.
  await prisma.project.update({ where: { id: PROJECT_ID }, data: { copeStatus: "IDLE" } });

  // ================================================================
  // Test 6: failure recovery
  // ================================================================
  process.stdout.write(`\n=== Test 6: failure recovery (FAILED -> READY) ===\n`);
  await prisma.project.update({
    where: { id: PROJECT_ID },
    data: { copeStatus: "FAILED", copeError: "synthetic prior failure for smoke test" },
  });
  const recoverRes = await fetch(`${BASE}/api/cope-estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: PROJECT_ID }),
  });
  note(recoverRes.ok, `recovery POST succeeded (got ${recoverRes.status})`);
  const recovered = await getProject();
  note(recovered?.copeStatus === "READY", `copeStatus transitioned FAILED -> READY (got ${recovered?.copeStatus})`);
  note(recovered?.copeError == null, `copeError cleared (got ${recovered?.copeError})`);

  // ================================================================
  // Summary
  // ================================================================
  process.stdout.write(`\n=== SUMMARY: ${failures === 0 ? "ALL PASS" : `${failures} FAILURES`} ===\n`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
