-- AlterTable: Replace single address/clientNames with structured fields and add transcriptText.
-- Add new columns
ALTER TABLE "Project" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "Project" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "Project" ADD COLUMN "city" TEXT;
ALTER TABLE "Project" ADD COLUMN "state" TEXT;
ALTER TABLE "Project" ADD COLUMN "zip" TEXT;
ALTER TABLE "Project" ADD COLUMN "client1First" TEXT;
ALTER TABLE "Project" ADD COLUMN "client1Last" TEXT;
ALTER TABLE "Project" ADD COLUMN "client2First" TEXT;
ALTER TABLE "Project" ADD COLUMN "client2Last" TEXT;
ALTER TABLE "Project" ADD COLUMN "transcriptText" TEXT;

-- Backfill: copy existing address into addressLine1, clientNames into client1First
UPDATE "Project" SET "addressLine1" = "address" WHERE "address" IS NOT NULL;
UPDATE "Project" SET "client1First" = "clientNames" WHERE "clientNames" IS NOT NULL;

-- Drop old columns
ALTER TABLE "Project" DROP COLUMN "address";
ALTER TABLE "Project" DROP COLUMN "clientNames";
