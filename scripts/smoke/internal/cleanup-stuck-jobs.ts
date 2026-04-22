/**
 * Clean up any `EstimateJob` rows on the Oyster Reef test project that are
 * stuck in QUEUED/RUNNING for more than an hour. Safe to run repeatedly —
 * no-op when nothing is stale.
 *
 * Companion to the Phase 8C PARTIAL-scenario smoke helpers (see
 * `break-one-room.ts` + `restore-broken-room.ts`). QStash retries + the
 * eventual-consistency of publish failures can leave the UI showing a
 * frozen job banner; this script marks the parent job FAILED and fails
 * out any still-unfinished child JobItem rows so the next bulk starts clean.
 *
 * Invocation:
 *   npx dotenv -e .env.local -- npx tsx scripts/smoke/internal/cleanup-stuck-jobs.ts
 */
import { prisma } from "../../../app/lib/prisma";

const PROJECT_ID = "cmo8mgpn20006o47kjvop2zlj";
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

async function main() {
  const project = await prisma.project.findUnique({
    where: { id: PROJECT_ID },
    select: { id: true, title: true },
  });
  if (!project) {
    console.error(`Project ${PROJECT_ID} not found — aborting.`);
    process.exit(1);
  }
  if (!project.title.toLowerCase().includes("oyster reef")) {
    console.error(
      `Project ${PROJECT_ID} title "${project.title}" does not match Oyster Reef — aborting for safety.`,
    );
    process.exit(1);
  }

  const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
  const stuckJobs = await prisma.estimateJob.findMany({
    where: {
      projectId: PROJECT_ID,
      status: { in: ["QUEUED", "RUNNING"] },
      createdAt: { lt: staleCutoff },
    },
    select: {
      id: true,
      status: true,
      totalItems: true,
      completedItems: true,
      failedItems: true,
      createdAt: true,
    },
  });

  if (stuckJobs.length === 0) {
    console.log("Nothing to clean up — no stuck EstimateJob rows on Oyster Reef.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${stuckJobs.length} stuck job(s). Cleaning up…`);
  for (const job of stuckJobs) {
    const now = new Date();
    const [jobUpdate, itemUpdate] = await prisma.$transaction([
      prisma.estimateJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedItems: job.totalItems,
          completedAt: now,
        },
      }),
      prisma.jobItem.updateMany({
        where: {
          estimateJobId: job.id,
          status: { in: ["QUEUED", "RUNNING"] },
        },
        data: {
          status: "FAILED",
          finishedAt: now,
          error: "Manual cleanup — stuck job",
        },
      }),
    ]);
    console.log(
      `  • Job ${job.id} (was ${job.status}, created ${job.createdAt.toISOString()}): set FAILED, ` +
        `${itemUpdate.count} child items marked FAILED. Parent totalItems=${jobUpdate.totalItems}, ` +
        `failedItems=${jobUpdate.failedItems}.`,
    );
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
