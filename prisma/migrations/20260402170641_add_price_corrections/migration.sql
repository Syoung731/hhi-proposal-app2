-- CreateTable
CREATE TABLE "PriceCorrection" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "originalValue" DOUBLE PRECISION NOT NULL,
    "correctedValue" DOUBLE PRECISION NOT NULL,
    "catalogItemName" TEXT,
    "tradeGroup" TEXT,
    "roomTemplateId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceCorrection_estimateId_idx" ON "PriceCorrection"("estimateId");

-- CreateIndex
CREATE INDEX "PriceCorrection_lineItemId_idx" ON "PriceCorrection"("lineItemId");

-- CreateIndex
CREATE INDEX "PriceCorrection_catalogItemName_idx" ON "PriceCorrection"("catalogItemName");

-- CreateIndex
CREATE INDEX "PriceCorrection_tradeGroup_idx" ON "PriceCorrection"("tradeGroup");

-- CreateIndex
CREATE INDEX "PriceCorrection_roomTemplateId_idx" ON "PriceCorrection"("roomTemplateId");

-- AddForeignKey
ALTER TABLE "PriceCorrection" ADD CONSTRAINT "PriceCorrection_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "AIEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceCorrection" ADD CONSTRAINT "PriceCorrection_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "EstimateLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
