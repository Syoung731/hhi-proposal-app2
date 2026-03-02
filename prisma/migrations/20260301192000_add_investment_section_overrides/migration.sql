-- AlterTable
ALTER TABLE "InvestmentLineItem" ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "overrideLow" INTEGER,
ADD COLUMN     "overrideTarget" INTEGER,
ADD COLUMN     "overrideHigh" INTEGER,
ADD COLUMN     "overrideNotes" TEXT,
ADD COLUMN     "isOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "includeInTotals" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentLineItem_projectId_roomId_key" ON "InvestmentLineItem"("projectId", "roomId");

-- AddForeignKey
ALTER TABLE "InvestmentLineItem" ADD CONSTRAINT "InvestmentLineItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (for roomId lookups)
CREATE INDEX "InvestmentLineItem_roomId_idx" ON "InvestmentLineItem"("roomId");
