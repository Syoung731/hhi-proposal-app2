-- Multi-space Rendr linking.
-- Replace the single-space link column (rendrSpaceId Int) with a multi-space
-- JSON column (rendrSpaces) holding [{ spaceId, label }] per linked space.
-- Pre-launch: no existing data is preserved.
ALTER TABLE "Project" DROP COLUMN "rendrSpaceId";
ALTER TABLE "Project" ADD COLUMN "rendrSpaces" JSONB;
