-- CreateEnum
CREATE TYPE "CopeStatus" AS ENUM ('IDLE', 'GENERATING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "autoGenerateCope" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "copeError" TEXT,
ADD COLUMN     "copeGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "copeStatus" "CopeStatus" NOT NULL DEFAULT 'IDLE';
