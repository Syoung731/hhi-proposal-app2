-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "promptVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "renderModel" TEXT,
ADD COLUMN     "renderProvider" TEXT,
ADD COLUMN     "sourceMediaId" TEXT,
ADD COLUMN     "stylePresetId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "stylePresetId" TEXT;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "stylePresetId" TEXT;

-- CreateTable
CREATE TABLE "StylePreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StylePreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StylePreset_name_key" ON "StylePreset"("name");

-- CreateIndex
CREATE INDEX "StylePreset_isActive_sortOrder_idx" ON "StylePreset"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Media_sourceMediaId_idx" ON "Media"("sourceMediaId");

-- CreateIndex
CREATE INDEX "Media_stylePresetId_idx" ON "Media"("stylePresetId");

-- CreateIndex
CREATE INDEX "Project_stylePresetId_idx" ON "Project"("stylePresetId");

-- CreateIndex
CREATE INDEX "Room_stylePresetId_idx" ON "Room"("stylePresetId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_stylePresetId_fkey" FOREIGN KEY ("stylePresetId") REFERENCES "StylePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_stylePresetId_fkey" FOREIGN KEY ("stylePresetId") REFERENCES "StylePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_stylePresetId_fkey" FOREIGN KEY ("stylePresetId") REFERENCES "StylePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
