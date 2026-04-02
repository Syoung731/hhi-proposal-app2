-- CreateTable
CREATE TABLE "CatalogSuggestion" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "tradeGroup" TEXT,
    "suggestedUnit" TEXT,
    "avgUnitPrice" DOUBLE PRECISION,
    "avgUnitCost" DOUBLE PRECISION,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "catalogItemId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogSuggestion_status_idx" ON "CatalogSuggestion"("status");

-- CreateIndex
CREATE INDEX "CatalogSuggestion_occurrenceCount_idx" ON "CatalogSuggestion"("occurrenceCount");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSuggestion_itemName_key" ON "CatalogSuggestion"("itemName");
