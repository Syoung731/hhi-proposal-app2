-- Manual edit: removed `DROP INDEX "Room_one_cope_per_project"` that Prisma's diff
-- generated. That index is a partial unique on (projectId) WHERE isProjectOverhead = true,
-- managed by the prior raw-SQL migration 20260502130431_enforce_singletons_and_cope_uniqueness.
-- Prisma's schema.prisma cannot express partial-unique-on-real-column in stable syntax,
-- so every migrate diff classifies it as drift. Do not re-add this DROP on future migrations.
-- A permanent guard lives at scripts/check-migration-drops.ts.

-- AlterTable
ALTER TABLE "PricingCatalogItem" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PricingCatalogItem_hidden_idx" ON "PricingCatalogItem"("hidden");
