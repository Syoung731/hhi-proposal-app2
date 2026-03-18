/*
  Warnings:

  - You are about to drop the column `benchmarkHigh` on the `SectionType` table. All the data in the column will be lost.
  - You are about to drop the column `benchmarkLow` on the `SectionType` table. All the data in the column will be lost.
  - You are about to drop the column `benchmarkSampleCount` on the `SectionType` table. All the data in the column will be lost.
  - You are about to drop the column `benchmarkTarget` on the `SectionType` table. All the data in the column will be lost.
  - You are about to drop the column `benchmarkUpdatedAt` on the `SectionType` table. All the data in the column will be lost.
  - You are about to drop the column `pricingSource` on the `SectionType` table. All the data in the column will be lost.
  - You are about to drop the `PricingImportGroup` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PricingImportItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PricingImportProject` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PricingRoomBenchmark` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PricingRoomSnapshot` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PricingImportGroup" DROP CONSTRAINT "PricingImportGroup_projectId_fkey";

-- DropForeignKey
ALTER TABLE "PricingImportItem" DROP CONSTRAINT "PricingImportItem_groupId_fkey";

-- DropForeignKey
ALTER TABLE "PricingImportItem" DROP CONSTRAINT "PricingImportItem_projectId_fkey";

-- AlterTable
ALTER TABLE "SectionType" DROP COLUMN "benchmarkHigh",
DROP COLUMN "benchmarkLow",
DROP COLUMN "benchmarkSampleCount",
DROP COLUMN "benchmarkTarget",
DROP COLUMN "benchmarkUpdatedAt",
DROP COLUMN "pricingSource";

-- DropTable
DROP TABLE "PricingImportGroup";

-- DropTable
DROP TABLE "PricingImportItem";

-- DropTable
DROP TABLE "PricingImportProject";

-- DropTable
DROP TABLE "PricingRoomBenchmark";

-- DropTable
DROP TABLE "PricingRoomSnapshot";

-- DropEnum
DROP TYPE "PricingSource";
