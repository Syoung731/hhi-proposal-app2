-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "displayGroupOrder" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "displayGroupId" TEXT,
ADD COLUMN     "displayGroupOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Room_projectId_displayGroupId_displayGroupOrder_idx" ON "Room"("projectId", "displayGroupId", "displayGroupOrder");
