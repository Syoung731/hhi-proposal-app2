-- AlterTable
ALTER TABLE "SyncedBudgetJob" ADD COLUMN     "sourceCostTotal" DECIMAL(19,4),
ADD COLUMN     "sourceFingerprint" TEXT,
ADD COLUMN     "sourceRowCount" INTEGER,
ADD COLUMN     "sourceSellTotal" DECIMAL(19,4);
