-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "editInstruction" TEXT,
ADD COLUMN     "parentMediaId" TEXT;

-- CreateIndex
CREATE INDEX "Media_parentMediaId_idx" ON "Media"("parentMediaId");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_parentMediaId_fkey" FOREIGN KEY ("parentMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
