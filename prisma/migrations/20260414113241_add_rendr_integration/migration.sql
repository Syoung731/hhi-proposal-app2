-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "rendrImportedAt" TIMESTAMP(3),
ADD COLUMN     "rendrLinkedAt" TIMESTAMP(3),
ADD COLUMN     "rendrProjectId" INTEGER,
ADD COLUMN     "rendrSpaceId" INTEGER;

-- CreateTable
CREATE TABLE "IntegrationSetting" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationSetting_service_key" ON "IntegrationSetting"("service");
