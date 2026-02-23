-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('KITCHEN', 'BATHROOM', 'LIVING_ROOM', 'BEDROOM', 'DINING_ROOM', 'OFFICE', 'BASEMENT', 'GARAGE', 'LAUNDRY', 'MUDROOM', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('COVER', 'BEFORE', 'AFTER', 'INSPIRATION', 'PLAN', 'TEAM', 'OTHER');

-- CreateEnum
CREATE TYPE "TimelinePhaseType" AS ENUM ('DESIGN_FEASIBILITY', 'PRECONSTRUCTION', 'CONSTRUCTION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "address" TEXT,
    "clientNames" TEXT,
    "coverHeroImageId" TEXT,
    "objective" TEXT,
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roomType" "RoomType" NOT NULL,
    "roomLabel" TEXT,
    "scopeNarrative" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roomId" TEXT,
    "kind" "MediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "tags" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelinePhase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phase" "TimelinePhaseType" NOT NULL,
    "durationText" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelinePhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentLineItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rangeLow" INTEGER,
    "rangeHigh" INTEGER,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishedSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- CreateIndex
CREATE INDEX "Room_projectId_idx" ON "Room"("projectId");

-- CreateIndex
CREATE INDEX "Room_projectId_sortOrder_idx" ON "Room"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Media_projectId_idx" ON "Media"("projectId");

-- CreateIndex
CREATE INDEX "Media_roomId_idx" ON "Media"("roomId");

-- CreateIndex
CREATE INDEX "Media_projectId_kind_idx" ON "Media"("projectId", "kind");

-- CreateIndex
CREATE INDEX "Media_projectId_sortOrder_idx" ON "Media"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "TimelinePhase_projectId_idx" ON "TimelinePhase"("projectId");

-- CreateIndex
CREATE INDEX "TimelinePhase_projectId_sortOrder_idx" ON "TimelinePhase"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "InvestmentLineItem_projectId_idx" ON "InvestmentLineItem"("projectId");

-- CreateIndex
CREATE INDEX "InvestmentLineItem_projectId_sortOrder_idx" ON "InvestmentLineItem"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "PublishedSnapshot_projectId_idx" ON "PublishedSnapshot"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedSnapshot_projectId_version_key" ON "PublishedSnapshot"("projectId", "version");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelinePhase" ADD CONSTRAINT "TimelinePhase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentLineItem" ADD CONSTRAINT "InvestmentLineItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedSnapshot" ADD CONSTRAINT "PublishedSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
