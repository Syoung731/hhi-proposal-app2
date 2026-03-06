-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Company',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuePillar" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "brandIconId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isHighlightDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValuePillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhyUsDefaults" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Why HHI Builders',
    "variant" TEXT NOT NULL DEFAULT 'gridCards',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhyUsDefaults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ValuePillar_companyId_sortOrder_idx" ON "ValuePillar"("companyId", "sortOrder");

-- CreateIndex
CREATE INDEX "ValuePillar_companyId_isDefault_idx" ON "ValuePillar"("companyId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "WhyUsDefaults_companyId_key" ON "WhyUsDefaults"("companyId");

-- AddForeignKey
ALTER TABLE "ValuePillar" ADD CONSTRAINT "ValuePillar_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuePillar" ADD CONSTRAINT "ValuePillar_brandIconId_fkey" FOREIGN KEY ("brandIconId") REFERENCES "BrandIcon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhyUsDefaults" ADD CONSTRAINT "WhyUsDefaults_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
