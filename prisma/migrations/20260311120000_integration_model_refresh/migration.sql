-- Drop existing Integration table and enum from previous JobTread integration.
-- Recreate with new schema: provider (string), name, baseUrl, encryptedSecret, metaJson, etc.
DROP TABLE IF EXISTS "Integration";
DROP TYPE IF EXISTS "IntegrationProvider";

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "baseUrl" TEXT,
    "encryptedSecret" TEXT,
    "metaJson" JSONB,
    "lastTestedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Integration_provider_name_key" ON "Integration"("provider", "name");
CREATE INDEX "Integration_provider_idx" ON "Integration"("provider");
CREATE INDEX "Integration_isActive_idx" ON "Integration"("isActive");
