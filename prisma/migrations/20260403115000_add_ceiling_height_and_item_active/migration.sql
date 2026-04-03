-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "defaultCeilingHeightFt" DOUBLE PRECISION DEFAULT 9;

-- AlterTable
ALTER TABLE "RoomTemplateItem" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
