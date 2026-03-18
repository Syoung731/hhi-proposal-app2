-- CreateTable
CREATE TABLE "RoomSubArea" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lengthIn" INTEGER,
    "widthIn" INTEGER,
    "ceilingHeightIn" INTEGER,
    "areaSqFt" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomSubArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomSubArea_roomId_sortOrder_idx" ON "RoomSubArea"("roomId", "sortOrder");

-- AddForeignKey
ALTER TABLE "RoomSubArea" ADD CONSTRAINT "RoomSubArea_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
