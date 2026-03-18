-- Corrective migration: ensure SectionType has columns expected by current schema.
-- Safe to run if columns already exist (ADD COLUMN IF NOT EXISTS / DO block for enum).
-- Fixes "column (not available) does not exist" when migrations 20260301214748 or 20260301220000 were not applied.

-- Create PricingBasis enum only if it does not exist (used by pricingBasis column)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PricingBasis') THEN
    CREATE TYPE "PricingBasis" AS ENUM ('NONE', 'PER_SF', 'PER_EACH', 'PER_JOB');
  END IF;
END
$$;

-- Add SectionType columns that may be missing (idempotent)
ALTER TABLE "SectionType" ADD COLUMN IF NOT EXISTS "pricePerSqFtLow" DOUBLE PRECISION;
ALTER TABLE "SectionType" ADD COLUMN IF NOT EXISTS "pricePerSqFtTarget" DOUBLE PRECISION;
ALTER TABLE "SectionType" ADD COLUMN IF NOT EXISTS "pricePerSqFtHigh" DOUBLE PRECISION;
ALTER TABLE "SectionType" ADD COLUMN IF NOT EXISTS "priceLow" DOUBLE PRECISION;
ALTER TABLE "SectionType" ADD COLUMN IF NOT EXISTS "priceTarget" DOUBLE PRECISION;
ALTER TABLE "SectionType" ADD COLUMN IF NOT EXISTS "priceHigh" DOUBLE PRECISION;
ALTER TABLE "SectionType" ADD COLUMN IF NOT EXISTS "pricingBasis" "PricingBasis" NOT NULL DEFAULT 'NONE';
