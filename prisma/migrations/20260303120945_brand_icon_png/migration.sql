/*
  Warnings:

  - Added the required column `imageKey` to the `BrandIcon` table without a default value. This is not possible if the table is not empty.
  - Added the required column `imageUrl` to the `BrandIcon` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BrandIcon" ADD COLUMN     "height" INTEGER,
ADD COLUMN     "imageKey" TEXT NOT NULL,
ADD COLUMN     "imageUrl" TEXT NOT NULL,
ADD COLUMN     "width" INTEGER,
ALTER COLUMN "svg" DROP NOT NULL;
