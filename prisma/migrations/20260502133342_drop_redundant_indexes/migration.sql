-- Manual edit: removed `DROP INDEX "Room_one_cope_per_project"` that Prisma's
-- diff regenerated. That index is managed by raw SQL in
-- 20260502130431_enforce_singletons_and_cope_uniqueness — Prisma's schema.prisma
-- cannot express partial-unique-on-real-column. Caught by
-- scripts/check-migration-drops.ts.

-- DropIndex
DROP INDEX "InvestmentLineItem_projectId_idx";

-- DropIndex
DROP INDEX "Proposal_projectId_idx";

-- DropIndex
DROP INDEX "ZillowBrowserConnection_nonce_idx";
