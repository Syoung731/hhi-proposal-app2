-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "jobtreadAccountId" TEXT,
ADD COLUMN     "jobtreadBudgetLockedAt" TIMESTAMP(3),
ADD COLUMN     "jobtreadJobId" TEXT,
ADD COLUMN     "jobtreadJobNumber" TEXT,
ADD COLUMN     "jobtreadLocationId" TEXT;

-- CreateTable
CREATE TABLE "JobTreadPushedItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jobtreadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobTreadPushedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobTreadPushedItem_projectId_idx" ON "JobTreadPushedItem"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_jobtreadJobId_key" ON "Project"("jobtreadJobId");

-- AddForeignKey
ALTER TABLE "JobTreadPushedItem" ADD CONSTRAINT "JobTreadPushedItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
