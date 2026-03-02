-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "ceilingHeightIn" INTEGER,
ADD COLUMN     "lengthIn" INTEGER,
ADD COLUMN     "widthIn" INTEGER;

-- Backfill inches from existing feet (ROUND(ft * 12))
UPDATE "Room"
SET
  "lengthIn" = CASE WHEN "lengthFt" IS NOT NULL THEN ROUND("lengthFt" * 12)::INTEGER ELSE NULL END,
  "widthIn" = CASE WHEN "widthFt" IS NOT NULL THEN ROUND("widthFt" * 12)::INTEGER ELSE NULL END,
  "ceilingHeightIn" = CASE WHEN "ceilingHeightFt" IS NOT NULL THEN ROUND("ceilingHeightFt" * 12)::INTEGER ELSE NULL END
WHERE "lengthFt" IS NOT NULL OR "widthFt" IS NOT NULL OR "ceilingHeightFt" IS NOT NULL;
