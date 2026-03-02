-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('QUEUED', 'RENDERING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "renderError" TEXT,
ADD COLUMN     "renderStatus" "RenderStatus";

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "selectedRenderMediaId" TEXT;
