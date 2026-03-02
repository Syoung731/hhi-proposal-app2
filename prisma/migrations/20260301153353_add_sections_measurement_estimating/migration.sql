-- CreateEnum
CREATE TYPE "SectionCategory" AS ENUM ('INTERIOR', 'EXTERIOR', 'SYSTEMS', 'WHOLE_HOME', 'ADDITION', 'FAST');

-- CreateEnum
CREATE TYPE "MeasurementMode" AS ENUM ('NONE', 'DIMENSIONS', 'AREA', 'COUNT');

-- CreateEnum
CREATE TYPE "EstimateUnit" AS ENUM ('SF', 'LF', 'EA', 'SQ', 'HR', 'DAY', 'ROOM', 'UNIT', 'GAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SectionOrigin" AS ENUM ('MANUAL', 'AI_TRANSCRIPT', 'TEMPLATE', 'IMPORTED');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "areaSqFt" DOUBLE PRECISION,
ADD COLUMN     "customUnitLabel" TEXT,
ADD COLUMN     "estimateUnit" "EstimateUnit",
ADD COLUMN     "measurementMode" "MeasurementMode",
ADD COLUMN     "origin" "SectionOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "sectionTypeId" TEXT,
ADD COLUMN     "unitQuantity" DOUBLE PRECISION,
ADD COLUMN     "unitRate" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SectionType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SectionCategory" NOT NULL,
    "defaultMeasurementMode" "MeasurementMode" NOT NULL,
    "defaultEstimateUnit" "EstimateUnit" NOT NULL,
    "customUnitLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SectionType_name_key" ON "SectionType"("name");

-- CreateIndex
CREATE INDEX "SectionType_category_idx" ON "SectionType"("category");

-- CreateIndex
CREATE INDEX "Room_sectionTypeId_idx" ON "Room"("sectionTypeId");

-- CreateIndex
CREATE INDEX "Room_origin_idx" ON "Room"("origin");

-- CreateIndex
CREATE INDEX "Room_estimateUnit_idx" ON "Room"("estimateUnit");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_sectionTypeId_fkey" FOREIGN KEY ("sectionTypeId") REFERENCES "SectionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
