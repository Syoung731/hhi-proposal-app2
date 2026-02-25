-- AlterTable Room: replace roomType/roomLabel with free-text name.
-- Add new column (nullable first for backfill)
ALTER TABLE "Room" ADD COLUMN "name" TEXT;

-- Backfill from roomType/roomLabel: use roomLabel when set, else format roomType (e.g. LIVING_ROOM -> Living Room)
UPDATE "Room" SET "name" = COALESCE("roomLabel", INITCAP(REPLACE("roomType"::text, '_', ' '))) WHERE "name" IS NULL;

-- Set default for any still-null (shouldn't happen)
UPDATE "Room" SET "name" = 'Room' WHERE "name" IS NULL;

-- Make name required
ALTER TABLE "Room" ALTER COLUMN "name" SET NOT NULL;

-- Drop old columns
ALTER TABLE "Room" DROP COLUMN "roomType";
ALTER TABLE "Room" DROP COLUMN "roomLabel";

-- DropRoomType enum
DROP TYPE "RoomType";
