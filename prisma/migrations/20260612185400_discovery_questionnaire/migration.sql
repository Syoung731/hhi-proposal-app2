-- CreateTable
CREATE TABLE "DiscoveryAnswer" (
    "id" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "answerText" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryLink" (
    "id" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "addedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryAttachment" (
    "id" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryAnswer_questionKey_key" ON "DiscoveryAnswer"("questionKey");

-- CreateIndex
CREATE INDEX "DiscoveryLink_questionKey_idx" ON "DiscoveryLink"("questionKey");

-- CreateIndex
CREATE INDEX "DiscoveryAttachment_questionKey_idx" ON "DiscoveryAttachment"("questionKey");
