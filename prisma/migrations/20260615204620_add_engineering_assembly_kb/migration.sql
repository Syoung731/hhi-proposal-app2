-- CreateEnum
CREATE TYPE "AssemblyReviewStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "EngineeringAssembly" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "discriminator" TEXT,
    "reviewStatus" "AssemblyReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "whenToUse" TEXT,
    "methodSummary" TEXT,
    "codeBasis" TEXT,
    "quantityBasis" TEXT,
    "caveats" TEXT,
    "unitOfAssembly" TEXT,
    "triggerKeywords" TEXT[],
    "tags" TEXT[],
    "sourceFirm" TEXT,
    "engineerName" TEXT,
    "engineerLicense" TEXT,
    "sourceRef" TEXT,
    "sourceDrawingUrl" TEXT,
    "sourceDrawingKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineeringAssembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineeringAssemblyComponent" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MEMBER',
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "model" TEXT,
    "qtyRule" TEXT,
    "unit" TEXT,
    "isConditional" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EngineeringAssemblyComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineeringAssemblySource" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "sourceFirm" TEXT,
    "engineerName" TEXT,
    "engineerLicense" TEXT,
    "certNumber" TEXT,
    "drawingDate" TEXT,
    "status" TEXT,
    "sourceRef" TEXT,
    "designCriteria" TEXT,
    "deltaNotes" TEXT,
    "rawMarkdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngineeringAssemblySource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringAssembly_slug_key" ON "EngineeringAssembly"("slug");

-- CreateIndex
CREATE INDEX "EngineeringAssembly_reviewStatus_idx" ON "EngineeringAssembly"("reviewStatus");

-- CreateIndex
CREATE INDEX "EngineeringAssembly_category_idx" ON "EngineeringAssembly"("category");

-- CreateIndex
CREATE INDEX "EngineeringAssembly_isActive_idx" ON "EngineeringAssembly"("isActive");

-- CreateIndex
CREATE INDEX "EngineeringAssemblyComponent_assemblyId_idx" ON "EngineeringAssemblyComponent"("assemblyId");

-- CreateIndex
CREATE INDEX "EngineeringAssemblySource_assemblyId_idx" ON "EngineeringAssemblySource"("assemblyId");

-- AddForeignKey
ALTER TABLE "EngineeringAssemblyComponent" ADD CONSTRAINT "EngineeringAssemblyComponent_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "EngineeringAssembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringAssemblySource" ADD CONSTRAINT "EngineeringAssemblySource_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "EngineeringAssembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;
