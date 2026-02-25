-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "primaryColorHex" TEXT,
ADD COLUMN     "textColorHex" TEXT;

-- Backfill: copy primaryColor into textColorHex when it looks like hex (#RRGGBB)
UPDATE "CompanySettings"
SET "textColorHex" = UPPER("primaryColor")
WHERE "primaryColor" IS NOT NULL
  AND "primaryColor" ~ '^#[0-9a-fA-F]{6}$';
