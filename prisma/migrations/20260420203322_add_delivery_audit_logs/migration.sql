-- CreateTable
CREATE TABLE "PdfDownloadLog" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "employeeId" TEXT,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfDownloadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLinkCopyLog" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "employeeId" TEXT,
    "copiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLinkCopyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdfDownloadLog_snapshotId_idx" ON "PdfDownloadLog"("snapshotId");

-- CreateIndex
CREATE INDEX "PdfDownloadLog_employeeId_idx" ON "PdfDownloadLog"("employeeId");

-- CreateIndex
CREATE INDEX "ShareLinkCopyLog_snapshotId_idx" ON "ShareLinkCopyLog"("snapshotId");

-- CreateIndex
CREATE INDEX "ShareLinkCopyLog_employeeId_idx" ON "ShareLinkCopyLog"("employeeId");

-- AddForeignKey
ALTER TABLE "PdfDownloadLog" ADD CONSTRAINT "PdfDownloadLog_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PublishedSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfDownloadLog" ADD CONSTRAINT "PdfDownloadLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLinkCopyLog" ADD CONSTRAINT "ShareLinkCopyLog_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PublishedSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLinkCopyLog" ADD CONSTRAINT "ShareLinkCopyLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
