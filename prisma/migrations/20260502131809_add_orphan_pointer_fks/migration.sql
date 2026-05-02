-- Manual edit: removed `DROP INDEX "Room_one_cope_per_project"` that Prisma's diff
-- generated. That index is a partial unique on (projectId) WHERE isProjectOverhead = true,
-- managed by the prior raw-SQL migration 20260502130431_enforce_singletons_and_cope_uniqueness.
-- Prisma's schema.prisma cannot express partial-unique-on-real-column in stable syntax,
-- so every migrate diff classifies it as drift. Do not re-add this DROP on future migrations.
-- See WEB_READINESS_PASS_2_PRISMA_INPUT_AUDIT.md and the verification script
-- scripts/verify-orphan-pointer-fks.ts for the canonical state.
-- A permanent guard lives at scripts/check-migration-drops.ts.

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_coverHeroImageId_fkey" FOREIGN KEY ("coverHeroImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckSlide" ADD CONSTRAINT "DeckSlide_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
