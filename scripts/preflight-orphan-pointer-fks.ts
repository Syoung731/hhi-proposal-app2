import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/app/lib/prisma";

/**
 * Pass 2 Cluster C pre-flight. Two new FKs:
 *
 *   DeckSlide.sectionId       -> Room.id    ON DELETE SET NULL  (sectionId is nullable)
 *   Project.coverHeroImageId  -> Media.id   ON DELETE SET NULL  (coverHeroImageId is nullable)
 *
 * Both target columns are nullable, so the cleanup for orphan pointers is
 * UPDATE-to-NULL rather than DELETE. Dry-run by default; --confirm writes.
 */
async function main() {
  const confirm = process.argv.includes("--confirm");
  console.log(`mode: ${confirm ? "CONFIRM (will write)" : "DRY-RUN (no writes)"}`);

  // --- Pre-flight inventories ---

  const deckSlideOrphans = await prisma.$queryRawUnsafe<{ id: string; sectionId: string }[]>(`
    SELECT ds.id, ds."sectionId"
    FROM "DeckSlide" ds
    LEFT JOIN "Room" r ON r.id = ds."sectionId"
    WHERE ds."sectionId" IS NOT NULL AND r.id IS NULL
  `);

  const projectOrphans = await prisma.$queryRawUnsafe<{ id: string; coverHeroImageId: string }[]>(`
    SELECT p.id, p."coverHeroImageId"
    FROM "Project" p
    LEFT JOIN "Media" m ON m.id = p."coverHeroImageId"
    WHERE p."coverHeroImageId" IS NOT NULL AND m.id IS NULL
  `);

  console.log(`\nDeckSlide rows with orphan sectionId (will SET NULL): ${deckSlideOrphans.length}`);
  for (const r of deckSlideOrphans.slice(0, 10)) console.log(`  ${r.id}  sectionId=${r.sectionId}`);
  if (deckSlideOrphans.length > 10) console.log(`  ...(${deckSlideOrphans.length - 10} more)`);

  console.log(`\nProject rows with orphan coverHeroImageId (will SET NULL): ${projectOrphans.length}`);
  for (const r of projectOrphans.slice(0, 10)) console.log(`  ${r.id}  coverHeroImageId=${r.coverHeroImageId}`);
  if (projectOrphans.length > 10) console.log(`  ...(${projectOrphans.length - 10} more)`);

  if (deckSlideOrphans.length === 0 && projectOrphans.length === 0) {
    console.log("\nNo orphans found. Safe to add FK constraints with no cleanup.");
    await prisma.$disconnect();
    return;
  }

  if (!confirm) {
    console.log("\nDry run complete. Re-run with --confirm to apply UPDATE-to-NULL cleanup.");
    await prisma.$disconnect();
    return;
  }

  // --- Cleanup ---

  console.log("\nApplying cleanup...");

  const deckUpdated = await prisma.$executeRawUnsafe(`
    UPDATE "DeckSlide"
    SET "sectionId" = NULL
    WHERE "sectionId" IS NOT NULL
      AND "sectionId" NOT IN (SELECT id FROM "Room")
  `);
  console.log(`  UPDATE DeckSlide set sectionId=NULL: ${deckUpdated} affected`);

  const projUpdated = await prisma.$executeRawUnsafe(`
    UPDATE "Project"
    SET "coverHeroImageId" = NULL
    WHERE "coverHeroImageId" IS NOT NULL
      AND "coverHeroImageId" NOT IN (SELECT id FROM "Media")
  `);
  console.log(`  UPDATE Project set coverHeroImageId=NULL: ${projUpdated} affected`);

  // Post-cleanup verification
  const postDeck = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT ds.id FROM "DeckSlide" ds LEFT JOIN "Room" r ON r.id = ds."sectionId" WHERE ds."sectionId" IS NOT NULL AND r.id IS NULL`,
  );
  const postProj = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT p.id FROM "Project" p LEFT JOIN "Media" m ON m.id = p."coverHeroImageId" WHERE p."coverHeroImageId" IS NOT NULL AND m.id IS NULL`,
  );
  console.log(`\npost-cleanup DeckSlide orphans: ${postDeck.length} (must be 0)`);
  console.log(`post-cleanup Project orphans:   ${postProj.length} (must be 0)`);

  if (postDeck.length !== 0 || postProj.length !== 0) {
    console.error("CLEANUP DID NOT FULLY RESOLVE ORPHANS");
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
