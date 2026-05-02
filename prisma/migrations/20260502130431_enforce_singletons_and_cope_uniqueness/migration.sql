-- Pass 2 Cluster B — DB-level singleton + COPE-per-project enforcement.
--
-- These four constraints are not modeled in prisma/schema.prisma because Prisma
-- has no clean syntax for "partial unique on a constant expression." They live
-- as raw SQL only. Verified via pg_indexes by scripts/verify-singleton-cope.ts.

-- Singleton enforcement: at most one row per table.
-- The expression `((true))` evaluates to a constant for every row, so the
-- unique index forbids any second row from existing — exactly what findFirst()
-- callers assume but Postgres did not previously enforce.
CREATE UNIQUE INDEX "CompanySettings_singleton" ON "CompanySettings"((true));
CREATE UNIQUE INDEX "Company_singleton" ON "Company"((true));
CREATE UNIQUE INDEX "CompanyContext_singleton" ON "CompanyContext"((true));

-- COPE-per-project: at most one Room with isProjectOverhead = true per project.
-- Application code maintains this invariant via ensureCopeRoom() but races
-- (e.g. concurrent project create) could violate it. DB-level partial unique
-- closes the window.
CREATE UNIQUE INDEX "Room_one_cope_per_project"
  ON "Room"("projectId")
  WHERE "isProjectOverhead" = true;
