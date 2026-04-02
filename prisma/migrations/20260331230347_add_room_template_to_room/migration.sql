-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "roomTemplateId" TEXT;

-- CreateIndex
CREATE INDEX "Room_roomTemplateId_idx" ON "Room"("roomTemplateId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_roomTemplateId_fkey" FOREIGN KEY ("roomTemplateId") REFERENCES "RoomTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
