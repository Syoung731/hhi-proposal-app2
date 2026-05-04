-- Phase 2 no-op migration.
-- Sole purpose: prove that `prisma migrate deploy` runs cleanly on Vercel
-- after the _prisma_migrations backfill. Adds a comment to a stable table
-- with no functional impact.

COMMENT ON TABLE "Project" IS 'Migration deploy path verified 2026-05-04';
