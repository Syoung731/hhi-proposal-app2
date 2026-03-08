-- CreateEnum
CREATE TYPE "ZillowConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ZillowHandshakeMethod" AS ENUM ('DIRECT', 'MANUAL');

-- CreateTable
CREATE TABLE "ZillowBrowserConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "ZillowConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "browserMetadata" JSONB,
    "extensionMetadata" JSONB,
    "handshakeMethod" "ZillowHandshakeMethod" NOT NULL DEFAULT 'DIRECT',

    CONSTRAINT "ZillowBrowserConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZillowBrowserConnection_nonce_key" ON "ZillowBrowserConnection"("nonce");

-- CreateIndex
CREATE INDEX "ZillowBrowserConnection_nonce_idx" ON "ZillowBrowserConnection"("nonce");

-- CreateIndex
CREATE INDEX "ZillowBrowserConnection_userId_idx" ON "ZillowBrowserConnection"("userId");

-- CreateIndex
CREATE INDEX "ZillowBrowserConnection_projectId_idx" ON "ZillowBrowserConnection"("projectId");

-- CreateIndex
CREATE INDEX "ZillowBrowserConnection_expiresAt_idx" ON "ZillowBrowserConnection"("expiresAt");

-- CreateIndex
CREATE INDEX "ZillowBrowserConnection_status_idx" ON "ZillowBrowserConnection"("status");

-- AddForeignKey
ALTER TABLE "ZillowBrowserConnection" ADD CONSTRAINT "ZillowBrowserConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
