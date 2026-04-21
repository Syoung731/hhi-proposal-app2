-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "JobItemStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "aiEstimateConcurrency" INTEGER;

-- CreateTable
CREATE TABLE "EstimateJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "totalItems" INTEGER NOT NULL,
    "completedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "EstimateJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItem" (
    "id" TEXT NOT NULL,
    "estimateJobId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" "JobItemStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "estimateId" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "JobItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EstimateJob_projectId_idx" ON "EstimateJob"("projectId");

-- CreateIndex
CREATE INDEX "EstimateJob_status_idx" ON "EstimateJob"("status");

-- CreateIndex
CREATE INDEX "EstimateJob_createdAt_idx" ON "EstimateJob"("createdAt");

-- CreateIndex
CREATE INDEX "JobItem_estimateJobId_idx" ON "JobItem"("estimateJobId");

-- CreateIndex
CREATE INDEX "JobItem_roomId_idx" ON "JobItem"("roomId");

-- CreateIndex
CREATE INDEX "JobItem_status_idx" ON "JobItem"("status");

-- AddForeignKey
ALTER TABLE "EstimateJob" ADD CONSTRAINT "EstimateJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_estimateJobId_fkey" FOREIGN KEY ("estimateJobId") REFERENCES "EstimateJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
