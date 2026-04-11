-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "bullets" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "supportingText" TEXT;
