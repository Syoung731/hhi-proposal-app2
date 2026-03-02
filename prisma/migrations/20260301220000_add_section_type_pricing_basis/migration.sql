-- CreateEnum
CREATE TYPE "PricingBasis" AS ENUM ('NONE', 'PER_SF', 'PER_EACH', 'PER_JOB');

-- AlterTable
ALTER TABLE "SectionType" ADD COLUMN "pricingBasis" "PricingBasis" NOT NULL DEFAULT 'NONE',
ADD COLUMN "priceLow" DOUBLE PRECISION,
ADD COLUMN "priceTarget" DOUBLE PRECISION,
ADD COLUMN "priceHigh" DOUBLE PRECISION;

-- Copy existing pricePerSqFt* into generic fields and set basis to PER_SF where pricing was set
UPDATE "SectionType"
SET "priceLow" = "pricePerSqFtLow",
    "priceTarget" = "pricePerSqFtTarget",
    "priceHigh" = "pricePerSqFtHigh",
    "pricingBasis" = 'PER_SF'
WHERE "pricePerSqFtTarget" IS NOT NULL OR "pricePerSqFtLow" IS NOT NULL OR "pricePerSqFtHigh" IS NOT NULL;
