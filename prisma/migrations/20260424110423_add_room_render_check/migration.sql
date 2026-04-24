-- CreateTable
CREATE TABLE "RoomRenderCheck" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "itemText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomRenderCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomRenderCheck_roomId_idx" ON "RoomRenderCheck"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomRenderCheck_roomId_itemText_key" ON "RoomRenderCheck"("roomId", "itemText");

-- AddForeignKey
ALTER TABLE "RoomRenderCheck" ADD CONSTRAINT "RoomRenderCheck_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 10 seed: for every existing Room whose scopeQA.renderChecklist has items,
-- create one RoomRenderCheck row per item so post-migration the UI and deck sync
-- show the same bullets users see today. This is Option B per the investigation
-- report — seed DB from DB, zero user-visible regression. Items are deduped by
-- the unique constraint on (roomId, itemText).
INSERT INTO "RoomRenderCheck" ("id", "roomId", "itemText", "createdAt")
SELECT
  gen_random_uuid()::text,
  r."id",
  item_text,
  NOW()
FROM "Room" r,
     jsonb_array_elements_text(r."scopeQA"->'renderChecklist') AS item_text
WHERE r."scopeQA" IS NOT NULL
  AND jsonb_typeof(r."scopeQA"->'renderChecklist') = 'array'
  AND length(trim(item_text)) > 0
ON CONFLICT ("roomId", "itemText") DO NOTHING;
