-- CreateTable
CREATE TABLE "ProposalDeck" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckSlide" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "layoutKey" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isUserHidden" BOOLEAN NOT NULL DEFAULT false,
    "isUserModified" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sectionId" TEXT,
    "headline" TEXT,
    "subheadline" TEXT,
    "body" TEXT,
    "content" JSONB,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockPosition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeckSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDeck_projectId_key" ON "ProposalDeck"("projectId");

-- CreateIndex
CREATE INDEX "DeckSlide_deckId_order_idx" ON "DeckSlide"("deckId", "order");

-- CreateIndex
CREATE INDEX "DeckSlide_deckId_type_idx" ON "DeckSlide"("deckId", "type");

-- CreateIndex
CREATE INDEX "DeckSlide_sectionId_idx" ON "DeckSlide"("sectionId");

-- AddForeignKey
ALTER TABLE "ProposalDeck" ADD CONSTRAINT "ProposalDeck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckSlide" ADD CONSTRAINT "DeckSlide_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "ProposalDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
