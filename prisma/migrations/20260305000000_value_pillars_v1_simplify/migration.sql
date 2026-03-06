-- DropIndex
DROP INDEX "ValuePillar_companyId_isDefault_idx";

-- AlterTable ValuePillar: remove name, body, isActive, isDefault, isHighlightDefault (V1: icon + headline only)
ALTER TABLE "ValuePillar" DROP COLUMN "name";
ALTER TABLE "ValuePillar" DROP COLUMN "body";
ALTER TABLE "ValuePillar" DROP COLUMN "isActive";
ALTER TABLE "ValuePillar" DROP COLUMN "isDefault";
ALTER TABLE "ValuePillar" DROP COLUMN "isHighlightDefault";

-- AlterTable WhyUsDefaults: remove variant (layout chosen per project)
ALTER TABLE "WhyUsDefaults" DROP COLUMN "variant";
