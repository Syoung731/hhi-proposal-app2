-- Multi-space Rendr linking.
-- Replace the single-space link column (rendrSpaceId Int) with a multi-space
-- JSON column (rendrSpaces) holding [{ spaceId, label }] per linked space.
-- Existing single-space links are converted to a one-entry array so live
-- projects keep their Rendr link through the cutover.
ALTER TABLE "Project" ADD COLUMN "rendrSpaces" JSONB;
UPDATE "Project"
SET "rendrSpaces" = jsonb_build_array(jsonb_build_object('spaceId', "rendrSpaceId", 'label', 'Main'))
WHERE "rendrSpaceId" IS NOT NULL;
ALTER TABLE "Project" DROP COLUMN "rendrSpaceId";
