-- AlterTable
ALTER TABLE "WhyUsDefaults" ALTER COLUMN "title" SET DEFAULT 'Why Us';

-- CreateTable
CREATE TABLE "ExtensionPairCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "ExtensionPairCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionPairCode_code_key" ON "ExtensionPairCode"("code");

-- CreateIndex
CREATE INDEX "ExtensionPairCode_projectId_idx" ON "ExtensionPairCode"("projectId");

-- CreateIndex
CREATE INDEX "ExtensionPairCode_expiresAt_idx" ON "ExtensionPairCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "ExtensionPairCode" ADD CONSTRAINT "ExtensionPairCode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
