-- DropIndex
DROP INDEX "Room_one_cope_per_project";

-- CreateTable
CREATE TABLE "PhotoUploadToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "uploadCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PhotoUploadToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoUploadToken_token_key" ON "PhotoUploadToken"("token");

-- CreateIndex
CREATE INDEX "PhotoUploadToken_projectId_idx" ON "PhotoUploadToken"("projectId");

-- CreateIndex
CREATE INDEX "PhotoUploadToken_expiresAt_idx" ON "PhotoUploadToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "PhotoUploadToken" ADD CONSTRAINT "PhotoUploadToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
