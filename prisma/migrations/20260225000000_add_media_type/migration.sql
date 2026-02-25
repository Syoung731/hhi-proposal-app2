-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('HERO', 'EXISTING', 'RENDERING');

-- AlterTable: add type column with default EXISTING
ALTER TABLE "Media" ADD COLUMN "type" "MediaType" NOT NULL DEFAULT 'EXISTING';

-- Backfill: existing cover images become HERO type (Media tab Hero section)
UPDATE "Media" SET "type" = 'HERO' WHERE "kind" = 'COVER';

-- CreateIndex: for filtering by type (e.g. hero, existing by room, renderings by room)
CREATE INDEX "Media_projectId_type_idx" ON "Media"("projectId", "type");
