-- CreateTable
CREATE TABLE "JobTreadPushJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "mode" TEXT NOT NULL DEFAULT 'create',
    "jobtreadJobId" TEXT NOT NULL,
    "jobtreadJobNumber" TEXT,
    "jobtreadAccountId" TEXT,
    "jobtreadLocationId" TEXT,
    "tree" JSONB NOT NULL,
    "totalGroups" INTEGER NOT NULL DEFAULT 0,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "createdGroups" INTEGER NOT NULL DEFAULT 0,
    "createdItems" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "JobTreadPushJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobTreadPushJob_projectId_idx" ON "JobTreadPushJob"("projectId");

-- CreateIndex
CREATE INDEX "JobTreadPushJob_status_idx" ON "JobTreadPushJob"("status");

-- AddForeignKey
ALTER TABLE "JobTreadPushJob" ADD CONSTRAINT "JobTreadPushJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

