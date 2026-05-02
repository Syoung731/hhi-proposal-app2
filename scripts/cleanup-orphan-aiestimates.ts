import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/app/lib/prisma";

/**
 * Pass-2 Cluster P2-A pre-flight + cleanup.
 *
 * Migration `20260331064037_add_ai_pricing_models` created `AIEstimate` with
 * three id columns (`projectId`, `sectionId`, `roomTemplateId`) but only added
 * an FK on `roomTemplateId`. Pass-2 adds the missing FKs with CASCADE delete
 * behavior. This script makes sure the FK additions can succeed: if any
 * `AIEstimate` row references a vanished Project (or vanished Room — note
 * that `sectionId` is the legacy name for what is now Room.id), the FK ALTER
 * will fail. Both categories are DELETEd: `sectionId` is NOT NULL in the
 * schema (an AIEstimate cannot exist without a Room), and the new FK will be
 * `onDelete: Cascade` — so deleting these orphan rows now is exactly what the
 * cascade would do automatically once the constraint lands.
 *
 * Dry-run by default; requires `--confirm` to perform deletes/updates.
 *
 *   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/cleanup-orphan-aiestimates.ts
 *   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/cleanup-orphan-aiestimates.ts --confirm
 *
 * Schema note: there is no `Section` table in the current schema. Sections
 * were renamed to Rooms; `AIEstimate.sectionId` is a soft pointer to `Room.id`.
 * The audit doc (WEB_READINESS_PASS_2_SCHEMA.md §2) flags this; the build
 * prompt's `Section` references should all be read as `Room`.
 */

type OrphanRow = { id: string; projectId?: string; sectionId?: string };

async function main() {
  const confirm = process.argv.includes("--confirm");

  console.log(`mode: ${confirm ? "CONFIRM (will write)" : "DRY-RUN (no writes)"}`);

  // --- A1: pre-flight orphan inventory ---

  const orphansByProject = await prisma.$queryRawUnsafe<OrphanRow[]>(`
    SELECT ai.id, ai."projectId"
    FROM "AIEstimate" ai
    LEFT JOIN "Project" p ON p.id = ai."projectId"
    WHERE p.id IS NULL
  `);

  const orphansBySection = await prisma.$queryRawUnsafe<OrphanRow[]>(`
    SELECT ai.id, ai."sectionId"
    FROM "AIEstimate" ai
    LEFT JOIN "Room" r ON r.id = ai."sectionId"
    WHERE ai."sectionId" IS NOT NULL AND r.id IS NULL
  `);

  console.log("");
  console.log(`orphans by Project (would be DELETED): ${orphansByProject.length}`);
  for (const r of orphansByProject.slice(0, 10)) console.log(`  ${r.id}  projectId=${r.projectId}`);
  if (orphansByProject.length > 10) console.log(`  ...(${orphansByProject.length - 10} more)`);

  console.log("");
  console.log(`orphans by Section/Room (would be DELETED — sectionId is NOT NULL): ${orphansBySection.length}`);
  for (const r of orphansBySection.slice(0, 10)) console.log(`  ${r.id}  sectionId=${r.sectionId}`);
  if (orphansBySection.length > 10) console.log(`  ...(${orphansBySection.length - 10} more)`);

  if (orphansByProject.length === 0 && orphansBySection.length === 0) {
    console.log("");
    console.log("No orphans found. Safe to add FK constraints with no cleanup.");
    await prisma.$disconnect();
    return;
  }

  if (!confirm) {
    console.log("");
    console.log("Dry run complete. Re-run with --confirm to apply cleanup.");
    await prisma.$disconnect();
    return;
  }

  // --- A2: apply cleanup ---

  console.log("");
  console.log("Applying cleanup...");

  const deletedRows = await prisma.$executeRawUnsafe(`
    DELETE FROM "AIEstimate"
    WHERE "projectId" NOT IN (SELECT id FROM "Project")
  `);
  console.log(`  DELETE AIEstimate rows with orphan projectId: ${deletedRows} affected`);

  const deletedSectionRows = await prisma.$executeRawUnsafe(`
    DELETE FROM "AIEstimate"
    WHERE "sectionId" NOT IN (SELECT id FROM "Room")
  `);
  console.log(`  DELETE AIEstimate rows with orphan sectionId: ${deletedSectionRows} affected`);

  // --- post-cleanup verification ---

  const postProject = await prisma.$queryRawUnsafe<OrphanRow[]>(`
    SELECT ai.id FROM "AIEstimate" ai
    LEFT JOIN "Project" p ON p.id = ai."projectId"
    WHERE p.id IS NULL
  `);
  const postSection = await prisma.$queryRawUnsafe<OrphanRow[]>(`
    SELECT ai.id FROM "AIEstimate" ai
    LEFT JOIN "Room" r ON r.id = ai."sectionId"
    WHERE r.id IS NULL
  `);

  console.log("");
  console.log(`post-cleanup orphans by Project: ${postProject.length} (must be 0)`);
  console.log(`post-cleanup orphans by Section: ${postSection.length} (must be 0)`);

  if (postProject.length !== 0 || postSection.length !== 0) {
    console.error("CLEANUP DID NOT FULLY RESOLVE ORPHANS — abort before running migration");
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
