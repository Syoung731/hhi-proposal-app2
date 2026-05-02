import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Permanent guard against the Pass-2 papercut: Prisma's `migrate diff`
 * keeps wanting to DROP raw-SQL-only constraints that schema.prisma cannot
 * express (e.g., partial unique indexes on real columns). If a future
 * `prisma migrate dev --create-only` re-emits a DROP for one of these
 * manually-managed objects, this script catches it BEFORE the migration is
 * applied.
 *
 * What it does:
 *   - Scans the most recently created migration's migration.sql
 *   - Looks for DROP INDEX / DROP CONSTRAINT statements naming any of the
 *     known manually-managed objects in PROTECTED_OBJECTS
 *   - Prints a warning and exits non-zero if found
 *   - Exits 0 if the migration is clean
 *
 * Usage:
 *   npx tsx scripts/check-migration-drops.ts
 *
 * Wire as a pre-commit hook target if/when a guard runner is added.
 *
 * To extend: add the object name (case-sensitive, exactly as it appears in
 * pg_indexes / pg_constraint) to PROTECTED_OBJECTS. Keep this list in sync
 * with raw-SQL-only objects in prisma/migrations/.
 *
 * Currently protected (all from Cluster B):
 *   - Room_one_cope_per_project          partial unique on (projectId) WHERE isProjectOverhead = true
 *   - CompanySettings_singleton           partial unique on ((true)) — singleton enforcement
 *   - Company_singleton                   same
 *   - CompanyContext_singleton            same
 *
 * Stable Prisma syntax cannot model these. Do not delete from this list
 * unless the underlying constraint has been removed (and a new migration
 * documents the removal).
 */

const PROTECTED_OBJECTS = [
  "Room_one_cope_per_project",
  "CompanySettings_singleton",
  "Company_singleton",
  "CompanyContext_singleton",
] as const;

function findNewestMigration(): string | null {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  if (!existsSync(migrationsDir)) return null;
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => /^\d{14}_/.test(n))
    .sort();
  return dirs[dirs.length - 1] ?? null;
}

function main() {
  const newest = findNewestMigration();
  if (!newest) {
    console.log("No migrations found. Nothing to check.");
    return;
  }
  const sqlPath = join(process.cwd(), "prisma", "migrations", newest, "migration.sql");
  if (!existsSync(sqlPath)) {
    console.log(`Migration ${newest} has no migration.sql. Skipping.`);
    return;
  }

  const sql = readFileSync(sqlPath, "utf8");
  const violations: { object: string; line: string }[] = [];

  for (const obj of PROTECTED_OBJECTS) {
    // Look for DROP INDEX "<name>" or DROP CONSTRAINT "<name>" on any line.
    // Case-sensitive — Postgres identifiers in Prisma migrations are quoted.
    const dropPatterns = [
      new RegExp(`DROP\\s+INDEX\\s+"${obj}"`, "i"),
      new RegExp(`DROP\\s+CONSTRAINT\\s+"${obj}"`, "i"),
    ];
    for (const line of sql.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("--")) continue; // comments are fine
      for (const re of dropPatterns) {
        if (re.test(trimmed)) violations.push({ object: obj, line: trimmed });
      }
    }
  }

  console.log(`Checked migration: ${newest}`);
  console.log(`Protected objects: ${PROTECTED_OBJECTS.length}`);

  if (violations.length === 0) {
    console.log("PASS — no DROP statements target protected manually-managed objects.");
    return;
  }

  console.error(`\nFAIL — ${violations.length} unwanted DROP statement(s) detected:`);
  for (const v of violations) {
    console.error(`  ${v.object}`);
    console.error(`    ${v.line}`);
  }
  console.error(
    `\nThese objects are managed by raw-SQL migrations (Prisma's schema.prisma\n` +
      `cannot express them in stable syntax). Delete the offending DROP line(s)\n` +
      `from the migration before applying. See header of\n` +
      `prisma/migrations/20260502131809_add_orphan_pointer_fks/migration.sql for an example.`,
  );
  process.exit(1);
}

main();
