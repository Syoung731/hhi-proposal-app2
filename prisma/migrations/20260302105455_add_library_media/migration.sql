-- CreateEnum
CREATE TYPE "LibraryUseType" AS ENUM ('BEFORE', 'AFTER', 'IN_PROGRESS', 'RENDER', 'DETAIL', 'LIFESTYLE');

-- CreateEnum
CREATE TYPE "LibraryQuality" AS ENUM ('HERO_READY', 'STANDARD');

-- CreateEnum
CREATE TYPE "LibraryOrientation" AS ENUM ('LANDSCAPE', 'PORTRAIT', 'SQUARE', 'PANORAMA', 'UNKNOWN');

-- CreateTable
CREATE TABLE "LibraryMedia" (
    "id" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "thumbnailUrl" TEXT,
    "title" TEXT,
    "description" TEXT,
    "roomTypeIds" TEXT[],
    "tags" TEXT[],
    "useType" "LibraryUseType" NOT NULL DEFAULT 'AFTER',
    "quality" "LibraryQuality" NOT NULL DEFAULT 'STANDARD',
    "orientation" "LibraryOrientation" NOT NULL DEFAULT 'UNKNOWN',
    "marketingApproved" BOOLEAN NOT NULL DEFAULT false,
    "sourceProjectName" TEXT,
    "sourceProjectId" TEXT,
    "photographer" TEXT,
    "createdByUserId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryMedia_useType_idx" ON "LibraryMedia"("useType");

-- CreateIndex
CREATE INDEX "LibraryMedia_quality_idx" ON "LibraryMedia"("quality");

-- CreateIndex
CREATE INDEX "LibraryMedia_orientation_idx" ON "LibraryMedia"("orientation");

-- CreateIndex
CREATE INDEX "LibraryMedia_marketingApproved_idx" ON "LibraryMedia"("marketingApproved");

-- CreateIndex
CREATE INDEX "LibraryMedia_createdAt_idx" ON "LibraryMedia"("createdAt");

-- CreateIndex
CREATE INDEX "LibraryMedia_sortOrder_idx" ON "LibraryMedia"("sortOrder");
