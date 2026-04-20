-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "directPhone" TEXT,
ADD COLUMN     "headshotUrl" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "linkedInUrl" TEXT,
ADD COLUMN     "mobilePhone" TEXT,
ADD COLUMN     "signatureEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "signatureQuote" TEXT;
