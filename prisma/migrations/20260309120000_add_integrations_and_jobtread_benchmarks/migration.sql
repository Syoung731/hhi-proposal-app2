-- Create IntegrationProvider enum and Integration table
CREATE TYPE "IntegrationProvider" AS ENUM ('JOBTREAD');

CREATE TABLE "Integration" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" "IntegrationProvider" NOT NULL,
  "displayName" TEXT NOT NULL,
  "apiBaseUrl" TEXT NOT NULL,
  "encryptedSecret" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "lastTestedAt" TIMESTAMPTZ,
  "lastSyncAt" TIMESTAMPTZ,
  "lastStatus" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "Integration_provider_key" ON "Integration" ("provider");

-- PricingSource enum and benchmark fields on SectionType
CREATE TYPE "PricingSource" AS ENUM ('MANUAL', 'JOBTREAD');

ALTER TABLE "SectionType"
  ADD COLUMN "pricingSource" "PricingSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "benchmarkTarget" DOUBLE PRECISION,
  ADD COLUMN "benchmarkLow" DOUBLE PRECISION,
  ADD COLUMN "benchmarkHigh" DOUBLE PRECISION,
  ADD COLUMN "benchmarkSampleCount" INTEGER,
  ADD COLUMN "benchmarkUpdatedAt" TIMESTAMPTZ;

