-- CreateTable
CREATE TABLE "PricingCatalogItem" (
    "id" TEXT NOT NULL,
    "jobtreadId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "costCode" TEXT,
    "costType" TEXT,
    "unitCost" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'EA',
    "trade" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomTemplate" (
    "id" TEXT NOT NULL,
    "jobtreadId" TEXT,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomTemplateTradeGroup" (
    "id" TEXT NOT NULL,
    "roomTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobtreadGroupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomTemplateTradeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomTemplateItem" (
    "id" TEXT NOT NULL,
    "tradeGroupId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "jobtreadItemId" TEXT,
    "name" TEXT NOT NULL,
    "costCode" TEXT,
    "costType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIEstimate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "roomTemplateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalCost" DOUBLE PRECISION,
    "totalPrice" DOUBLE PRECISION,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "tradeGroup" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'EA',
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'AI_PRICED',
    "confidence" DOUBLE PRECISION,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyContext" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL DEFAULT 'Hilton Head Island, SC',
    "marketNotes" TEXT,
    "clientProfile" TEXT,
    "defaultFinishTier" TEXT NOT NULL DEFAULT 'high-end',
    "standardInclusions" TEXT,
    "markupStructure" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingCatalogItem_jobtreadId_key" ON "PricingCatalogItem"("jobtreadId");

-- CreateIndex
CREATE INDEX "PricingCatalogItem_trade_idx" ON "PricingCatalogItem"("trade");

-- CreateIndex
CREATE INDEX "PricingCatalogItem_active_idx" ON "PricingCatalogItem"("active");

-- CreateIndex
CREATE INDEX "PricingCatalogItem_name_idx" ON "PricingCatalogItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RoomTemplate_jobtreadId_key" ON "RoomTemplate"("jobtreadId");

-- CreateIndex
CREATE INDEX "RoomTemplate_active_idx" ON "RoomTemplate"("active");

-- CreateIndex
CREATE INDEX "RoomTemplateTradeGroup_roomTemplateId_idx" ON "RoomTemplateTradeGroup"("roomTemplateId");

-- CreateIndex
CREATE INDEX "RoomTemplateItem_tradeGroupId_idx" ON "RoomTemplateItem"("tradeGroupId");

-- CreateIndex
CREATE INDEX "RoomTemplateItem_catalogItemId_idx" ON "RoomTemplateItem"("catalogItemId");

-- CreateIndex
CREATE INDEX "AIEstimate_projectId_idx" ON "AIEstimate"("projectId");

-- CreateIndex
CREATE INDEX "AIEstimate_sectionId_idx" ON "AIEstimate"("sectionId");

-- CreateIndex
CREATE INDEX "AIEstimate_roomTemplateId_idx" ON "AIEstimate"("roomTemplateId");

-- CreateIndex
CREATE INDEX "AIEstimate_status_idx" ON "AIEstimate"("status");

-- CreateIndex
CREATE INDEX "EstimateLineItem_estimateId_idx" ON "EstimateLineItem"("estimateId");

-- CreateIndex
CREATE INDEX "EstimateLineItem_catalogItemId_idx" ON "EstimateLineItem"("catalogItemId");

-- AddForeignKey
ALTER TABLE "RoomTemplateTradeGroup" ADD CONSTRAINT "RoomTemplateTradeGroup_roomTemplateId_fkey" FOREIGN KEY ("roomTemplateId") REFERENCES "RoomTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTemplateItem" ADD CONSTRAINT "RoomTemplateItem_tradeGroupId_fkey" FOREIGN KEY ("tradeGroupId") REFERENCES "RoomTemplateTradeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTemplateItem" ADD CONSTRAINT "RoomTemplateItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "PricingCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIEstimate" ADD CONSTRAINT "AIEstimate_roomTemplateId_fkey" FOREIGN KEY ("roomTemplateId") REFERENCES "RoomTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "AIEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "PricingCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
