-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "SectionBucket" AS ENUM ('BASE', 'ALTERNATE', 'ALLOWANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable Room: add bucket (idempotent)
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "bucket" "SectionBucket" NOT NULL DEFAULT 'BASE';
CREATE INDEX IF NOT EXISTS "Room_projectId_bucket_idx" ON "Room"("projectId", "bucket");

-- AlterTable InvestmentLineItem: add bucket (nullable for migration)
ALTER TABLE "InvestmentLineItem" ADD COLUMN IF NOT EXISTS "bucket" "SectionBucket";

-- Clear any previously inserted bucket-based rows (idempotent re-run)
DELETE FROM "InvestmentLineItem" WHERE "bucket" IS NOT NULL;

-- Migrate: compute rollups per project per bucket from Room totals, then replace all items
WITH project_buckets AS (
  SELECT p.id AS "projectId", b.bucket
  FROM "Project" p
  CROSS JOIN (SELECT unnest(ARRAY['BASE'::"SectionBucket", 'ALTERNATE', 'ALLOWANCE']) AS bucket) b
),
rollups AS (
  SELECT "projectId", bucket,
    SUM(COALESCE("totalLow", 0))::integer AS "rangeLow",
    SUM(COALESCE("totalTarget", 0))::integer AS "rangeTarget",
    SUM(COALESCE("totalHigh", 0))::integer AS "rangeHigh"
  FROM "Room"
  GROUP BY "projectId", bucket
),
labels AS (
  SELECT 'BASE'::"SectionBucket" AS bucket, 'Base' AS label, 0 AS "sortOrder"
  UNION ALL SELECT 'ALTERNATE'::"SectionBucket", 'Alternates', 1
  UNION ALL SELECT 'ALLOWANCE'::"SectionBucket", 'Allowances', 2
),
new_rows AS (
  SELECT gen_random_uuid()::text AS id, pb."projectId", pb.bucket, l.label, l."sortOrder",
    COALESCE(r."rangeLow", 0) AS "rangeLow",
    COALESCE(r."rangeTarget", 0) AS "rangeTarget",
    COALESCE(r."rangeHigh", 0) AS "rangeHigh"
  FROM project_buckets pb
  JOIN labels l ON l.bucket = pb.bucket
  LEFT JOIN rollups r ON r."projectId" = pb."projectId" AND r.bucket = pb.bucket
)
INSERT INTO "InvestmentLineItem" (id, "projectId", "bucket", "label", "rangeLow", "rangeTarget", "rangeHigh", "sortOrder", "createdAt", "updatedAt")
SELECT id, "projectId", bucket, label, "rangeLow", "rangeTarget", "rangeHigh", "sortOrder", NOW(), NOW()
FROM new_rows;

-- Drop old unique and roomId; keep only new bucket-based rows
ALTER TABLE "InvestmentLineItem" DROP CONSTRAINT IF EXISTS "InvestmentLineItem_projectId_roomId_key";
DROP INDEX IF EXISTS "InvestmentLineItem_roomId_idx";
DROP INDEX IF EXISTS "InvestmentLineItem_projectId_bucket_key";
-- Remove all rows that don't have a bucket (old per-room and manual rows)
DELETE FROM "InvestmentLineItem" WHERE "bucket" IS NULL;
ALTER TABLE "InvestmentLineItem" DROP COLUMN IF EXISTS "roomId";
ALTER TABLE "InvestmentLineItem" ALTER COLUMN "bucket" SET NOT NULL;
CREATE UNIQUE INDEX "InvestmentLineItem_projectId_bucket_key" ON "InvestmentLineItem"("projectId", "bucket");
