-- CreateTable
CREATE TABLE "PricingSourceJob" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobNumber" TEXT,
    "includeInPricing" BOOLEAN NOT NULL DEFAULT false,
    "sourceLastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSourceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSourceRoom" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "pricingJobId" TEXT NOT NULL,
    "roomKey" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "normalizedRoomName" TEXT,
    "sectionTypeId" TEXT,
    "sectionTypeSource" TEXT,
    "includeInPricing" BOOLEAN NOT NULL DEFAULT false,
    "autoDetectedSqFt" DECIMAL(19,2),
    "manualSqFtOverride" DECIMAL(19,2),
    "totalCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalSell" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "costPerSqFt" DECIMAL(19,4),
    "sellPerSqFt" DECIMAL(19,4),
    "sqFtSource" TEXT,
    "hasValidSqFt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSourceRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSourceTrade" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "totalCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalSell" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSourceTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingSourceJob_jobId_key" ON "PricingSourceJob"("jobId");

-- CreateIndex
CREATE INDEX "PricingSourceRoom_sectionTypeId_idx" ON "PricingSourceRoom"("sectionTypeId");

-- CreateIndex
CREATE INDEX "PricingSourceRoom_includeInPricing_idx" ON "PricingSourceRoom"("includeInPricing");

-- CreateIndex
CREATE INDEX "PricingSourceRoom_jobId_idx" ON "PricingSourceRoom"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingSourceRoom_jobId_roomName_key" ON "PricingSourceRoom"("jobId", "roomName");

-- CreateIndex
CREATE INDEX "PricingSourceTrade_jobId_idx" ON "PricingSourceTrade"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingSourceTrade_roomId_tradeName_key" ON "PricingSourceTrade"("roomId", "tradeName");

-- AddForeignKey
ALTER TABLE "PricingSourceRoom" ADD CONSTRAINT "PricingSourceRoom_pricingJobId_fkey" FOREIGN KEY ("pricingJobId") REFERENCES "PricingSourceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingSourceRoom" ADD CONSTRAINT "PricingSourceRoom_sectionTypeId_fkey" FOREIGN KEY ("sectionTypeId") REFERENCES "SectionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingSourceTrade" ADD CONSTRAINT "PricingSourceTrade_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PricingSourceJob"("jobId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingSourceTrade" ADD CONSTRAINT "PricingSourceTrade_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "PricingSourceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
