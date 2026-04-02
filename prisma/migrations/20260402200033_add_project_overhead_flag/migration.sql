/*
  Warnings:

  - You are about to drop the column `aiBackground` on the `DeckSlide` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DeckSlide" DROP COLUMN "aiBackground";

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "isProjectOverhead" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RoomTemplate" ADD COLUMN     "isProjectOverhead" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Room_projectId_isProjectOverhead_idx" ON "Room"("projectId", "isProjectOverhead");
