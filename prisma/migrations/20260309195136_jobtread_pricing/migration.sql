-- CreateTable
CREATE TABLE "PricingRoomSnapshot" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "sellTotal" DOUBLE PRECISION NOT NULL,
    "costTotal" DOUBLE PRECISION NOT NULL,
    "flooringSf" DOUBLE PRECISION NOT NULL,
    "sellPerSf" DOUBLE PRECISION NOT NULL,
    "costPerSf" DOUBLE PRECISION NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingRoomSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRoomBenchmark" (
    "id" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "avgSellPerSf" DOUBLE PRECISION NOT NULL,
    "avgCostPerSf" DOUBLE PRECISION NOT NULL,
    "minSellPerSf" DOUBLE PRECISION NOT NULL,
    "maxSellPerSf" DOUBLE PRECISION NOT NULL,
    "jobsIncluded" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRoomBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingRoomSnapshot_jobId_idx" ON "PricingRoomSnapshot"("jobId");

-- CreateIndex
CREATE INDEX "PricingRoomSnapshot_roomName_idx" ON "PricingRoomSnapshot"("roomName");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRoomBenchmark_roomName_key" ON "PricingRoomBenchmark"("roomName");
