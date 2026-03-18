-- Add nullable benchmarkGroupOverride to PricingImportGroup
ALTER TABLE "PricingImportGroup"
ADD COLUMN IF NOT EXISTS "benchmarkGroupOverride" TEXT;

