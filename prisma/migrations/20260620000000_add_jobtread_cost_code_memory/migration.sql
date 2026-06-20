-- CreateTable
CREATE TABLE "JobTreadCostCodeMemory" (
    "id" TEXT NOT NULL,
    "itemNameKey" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costCodeName" TEXT NOT NULL,
    "costTypeId" TEXT,
    "costTypeName" TEXT,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTreadCostCodeMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobTreadCostCodeMemory_itemNameKey_key" ON "JobTreadCostCodeMemory"("itemNameKey");

