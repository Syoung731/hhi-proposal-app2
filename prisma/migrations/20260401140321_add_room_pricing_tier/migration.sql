-- CreateEnum
CREATE TYPE "RoomPricingTier" AS ENUM ('PROFILE', 'AI_ESTIMATE', 'MANUAL');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "pricingTier" "RoomPricingTier" NOT NULL DEFAULT 'PROFILE';
