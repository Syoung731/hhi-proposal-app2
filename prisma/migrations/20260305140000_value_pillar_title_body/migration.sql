-- ValuePillar: rename headline -> title, add body (required with default for existing rows)
ALTER TABLE "ValuePillar" RENAME COLUMN "headline" TO "title";
ALTER TABLE "ValuePillar" ADD COLUMN "body" TEXT NOT NULL DEFAULT '';
