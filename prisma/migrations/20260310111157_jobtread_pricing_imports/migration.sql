-- CreateTable
CREATE TABLE "PricingImportProject" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "normalizedStage" TEXT,
    "closedOnRaw" TEXT,
    "includeInPricing" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingImportProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingImportGroup" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jobtreadGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentJobtreadGroupId" TEXT,
    "normalizedPricingGroup" TEXT,
    "groupKind" TEXT,
    "isValidPricingGroup" BOOLEAN NOT NULL DEFAULT false,
    "exclusionReason" TEXT,
    "includeInPricing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingImportGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingImportItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "groupId" TEXT,
    "jobtreadItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "includeInPricing" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingImportProject_jobId_key" ON "PricingImportProject"("jobId");

-- CreateIndex
CREATE INDEX "PricingImportProject_includeInPricing_idx" ON "PricingImportProject"("includeInPricing");

-- CreateIndex
CREATE INDEX "PricingImportProject_lastSyncedAt_idx" ON "PricingImportProject"("lastSyncedAt");

-- CreateIndex
CREATE INDEX "PricingImportGroup_projectId_idx" ON "PricingImportGroup"("projectId");

-- CreateIndex
CREATE INDEX "PricingImportGroup_includeInPricing_idx" ON "PricingImportGroup"("includeInPricing");

-- CreateIndex
CREATE UNIQUE INDEX "PricingImportGroup_projectId_jobtreadGroupId_key" ON "PricingImportGroup"("projectId", "jobtreadGroupId");

-- CreateIndex
CREATE INDEX "PricingImportItem_projectId_idx" ON "PricingImportItem"("projectId");

-- CreateIndex
CREATE INDEX "PricingImportItem_groupId_idx" ON "PricingImportItem"("groupId");

-- CreateIndex
CREATE INDEX "PricingImportItem_includeInPricing_idx" ON "PricingImportItem"("includeInPricing");

-- CreateIndex
CREATE UNIQUE INDEX "PricingImportItem_projectId_jobtreadItemId_key" ON "PricingImportItem"("projectId", "jobtreadItemId");

-- AddForeignKey
ALTER TABLE "PricingImportGroup" ADD CONSTRAINT "PricingImportGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PricingImportProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingImportItem" ADD CONSTRAINT "PricingImportItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PricingImportProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingImportItem" ADD CONSTRAINT "PricingImportItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PricingImportGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
