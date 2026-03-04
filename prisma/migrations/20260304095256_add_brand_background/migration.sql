-- CreateTable
CREATE TABLE "BrandBackground" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseColorHex" TEXT,
    "overlayImageUrl" TEXT,
    "overlayImageKey" TEXT,
    "overlayIconId" TEXT,
    "overlayOpacity" INTEGER NOT NULL DEFAULT 6,
    "overlayScale" INTEGER NOT NULL DEFAULT 100,
    "overlaySpacing" INTEGER NOT NULL DEFAULT 120,
    "overlayRotation" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandBackground_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandBackground_slug_key" ON "BrandBackground"("slug");

-- CreateIndex
CREATE INDEX "BrandBackground_isActive_sortOrder_idx" ON "BrandBackground"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "BrandBackground" ADD CONSTRAINT "BrandBackground_overlayIconId_fkey" FOREIGN KEY ("overlayIconId") REFERENCES "BrandIcon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
