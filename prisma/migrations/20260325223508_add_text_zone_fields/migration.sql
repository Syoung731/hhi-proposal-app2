-- AlterTable
ALTER TABLE "BrandBackground" ADD COLUMN     "compositionSeed" TEXT,
ADD COLUMN     "textZoneSuggestion" JSONB;

-- AlterTable
ALTER TABLE "DeckSlide" ADD COLUMN     "backgroundId" TEXT,
ADD COLUMN     "textZone" JSONB;

-- CreateIndex
CREATE INDEX "DeckSlide_backgroundId_idx" ON "DeckSlide"("backgroundId");

-- AddForeignKey
ALTER TABLE "DeckSlide" ADD CONSTRAINT "DeckSlide_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "BrandBackground"("id") ON DELETE SET NULL ON UPDATE CASCADE;
