-- AlterEnum: add milestone entries to TimelinePhaseType.
-- Postgres requires ALTER TYPE ADD VALUE outside of a transaction block.
ALTER TYPE "TimelinePhaseType" ADD VALUE IF NOT EXISTS 'SIGN_CONTRACT' BEFORE 'DESIGN_FEASIBILITY';
ALTER TYPE "TimelinePhaseType" ADD VALUE IF NOT EXISTS 'START_DESIGN' BEFORE 'DESIGN_FEASIBILITY';

-- AlterTable: per-project override columns for phase name and description.
ALTER TABLE "TimelinePhase" ADD COLUMN "nameOverride" TEXT;
ALTER TABLE "TimelinePhase" ADD COLUMN "descriptionOverride" TEXT;
