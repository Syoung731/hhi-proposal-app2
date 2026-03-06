-- Ensure ValuePillar and WhyUsDefaults match current schema (idempotent).
-- Safe to run whether or not value_pillars_v1_simplify was previously applied.

-- ValuePillar: drop columns removed in V1 simplify (IF EXISTS so no error if already dropped)
ALTER TABLE "ValuePillar" DROP COLUMN IF EXISTS "name";
ALTER TABLE "ValuePillar" DROP COLUMN IF EXISTS "body";
ALTER TABLE "ValuePillar" DROP COLUMN IF EXISTS "isActive";
ALTER TABLE "ValuePillar" DROP COLUMN IF EXISTS "isDefault";
ALTER TABLE "ValuePillar" DROP COLUMN IF EXISTS "isHighlightDefault";

-- WhyUsDefaults: drop variant if present
ALTER TABLE "WhyUsDefaults" DROP COLUMN IF EXISTS "variant";
