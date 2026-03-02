-- CreateEnum
CREATE TYPE "MediaPlacement" AS ENUM ('SECTION', 'FRONT_PAGE', 'UNASSIGNED');

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "placement" "MediaPlacement" NOT NULL DEFAULT 'UNASSIGNED';

-- Backfill: roomId set -> SECTION, else stays UNASSIGNED
UPDATE "Media" SET "placement" = 'SECTION' WHERE "roomId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Media_projectId_placement_idx" ON "Media"("projectId", "placement");
