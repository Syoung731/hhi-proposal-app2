-- CreateTable
CREATE TABLE "RenderChangeSummary" (
    "id" TEXT NOT NULL,
    "sourceMediaId" TEXT NOT NULL,
    "renderMediaId" TEXT NOT NULL,
    "differences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenderChangeSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RenderChangeSummary_sourceMediaId_renderMediaId_idx" ON "RenderChangeSummary"("sourceMediaId", "renderMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "RenderChangeSummary_sourceMediaId_renderMediaId_key" ON "RenderChangeSummary"("sourceMediaId", "renderMediaId");
