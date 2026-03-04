-- CreateTable
CREATE TABLE "BrandIcon" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "svg" TEXT NOT NULL,
    "tags" TEXT[],
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandIcon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandIcon_slug_key" ON "BrandIcon"("slug");

-- CreateIndex
CREATE INDEX "BrandIcon_name_idx" ON "BrandIcon"("name");
