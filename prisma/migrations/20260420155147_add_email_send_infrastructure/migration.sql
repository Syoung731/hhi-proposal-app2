-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "dailySentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dailySentResetAt" TIMESTAMP(3),
ADD COLUMN     "lastSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailSendLog" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT,
    "employeeId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,
    "metadataJson" JSONB,

    CONSTRAINT "EmailSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSendLog_snapshotId_idx" ON "EmailSendLog"("snapshotId");

-- CreateIndex
CREATE INDEX "EmailSendLog_employeeId_idx" ON "EmailSendLog"("employeeId");

-- CreateIndex
CREATE INDEX "EmailSendLog_sentAt_idx" ON "EmailSendLog"("sentAt");

-- AddForeignKey
ALTER TABLE "EmailSendLog" ADD CONSTRAINT "EmailSendLog_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PublishedSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSendLog" ADD CONSTRAINT "EmailSendLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
