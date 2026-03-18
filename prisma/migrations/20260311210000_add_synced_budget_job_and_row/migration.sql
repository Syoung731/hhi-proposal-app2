-- CreateTable
CREATE TABLE "SyncedBudgetJob" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobNumber" TEXT,
    "stage" TEXT,
    "location" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncMessage" TEXT,
    "lastRowCount" INTEGER NOT NULL DEFAULT 0,
    "officialSellTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "officialCostTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "sourceSummarySell" DECIMAL(19,4),
    "sourceSummaryCost" DECIMAL(19,4),
    "rawBudgetJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedBudgetJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedBudgetRow" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "externalBudgetItemId" TEXT NOT NULL,
    "groupName" TEXT,
    "itemName" TEXT NOT NULL,
    "costCode" TEXT,
    "costCodeName" TEXT,
    "costType" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(19,6),
    "unitCost" DECIMAL(19,4),
    "unitPrice" DECIMAL(19,4),
    "extCost" DECIMAL(19,4) NOT NULL,
    "extSell" DECIMAL(19,4) NOT NULL,
    "rawPayloadJson" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedBudgetRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncedBudgetJob_jobId_key" ON "SyncedBudgetJob"("jobId");
CREATE INDEX "SyncedBudgetJob_lastSyncStatus_idx" ON "SyncedBudgetJob"("lastSyncStatus");
CREATE INDEX "SyncedBudgetJob_lastSyncedAt_idx" ON "SyncedBudgetJob"("lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedBudgetRow_jobId_externalBudgetItemId_key" ON "SyncedBudgetRow"("jobId", "externalBudgetItemId");
CREATE INDEX "SyncedBudgetRow_jobId_idx" ON "SyncedBudgetRow"("jobId");
CREATE INDEX "SyncedBudgetRow_groupName_idx" ON "SyncedBudgetRow"("groupName");
CREATE INDEX "SyncedBudgetRow_costCode_idx" ON "SyncedBudgetRow"("costCode");

-- AddForeignKey
ALTER TABLE "SyncedBudgetRow" ADD CONSTRAINT "SyncedBudgetRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SyncedBudgetJob"("jobId") ON DELETE CASCADE ON UPDATE CASCADE;
