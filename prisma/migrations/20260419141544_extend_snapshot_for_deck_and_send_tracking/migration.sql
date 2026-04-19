-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "clientFacingVersion" INTEGER;

-- AlterTable
ALTER TABLE "PublishedSnapshot" ADD COLUMN     "label" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentByEmployeeId" TEXT,
ADD COLUMN     "sentToEmail" TEXT;

-- CreateIndex
CREATE INDEX "PublishedSnapshot_sentByEmployeeId_idx" ON "PublishedSnapshot"("sentByEmployeeId");

-- AddForeignKey
ALTER TABLE "PublishedSnapshot" ADD CONSTRAINT "PublishedSnapshot_sentByEmployeeId_fkey" FOREIGN KEY ("sentByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
