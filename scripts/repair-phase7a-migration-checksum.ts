import "dotenv/config";
import { execSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/app/lib/prisma";

/**
 * One-shot repair for a pre-existing bookkeeping drift on the Phase-7a Rendr
 * structured-fields migration. The migration was applied cleanly to the DB,
 * but the migration.sql file was later re-committed with different bytes
 * (probably a pre-commit reformat before the first push). The result: Prisma
 * stores one SHA-256 in `_prisma_migrations`, the file on disk hashes to a
 * different value, and `prisma migrate dev` refuses to run on the next
 * migration attempt ("migration was modified after it was applied") even
 * though `prisma migrate status` reports the schema as up-to-date.
 *
 * What this script does
 *   1. Runs `prisma migrate status`. If the schema is NOT up to date, it
 *      aborts loudly — we do not want to paper over real schema drift with a
 *      checksum rewrite.
 *   2. Reads the current on-disk migration.sql, computes the SHA-256 Prisma
 *      would compute.
 *   3. Selects the current row from `_prisma_migrations` and prints a before
 *      snapshot (migration name, old checksum, file size, timestamp).
 *   4. If `--confirm` is NOT passed, exits here — dry run.
 *   5. If `--confirm` IS passed, issues an UPDATE to set the checksum column
 *      to match the current file, then prints an after snapshot.
 *
 * This is purely a metadata write — no schema change, no data loss, fully
 * reversible (the old checksum is logged before/after so it can be put back
 * if needed). The schema columns this migration added were already present
 * and confirmed healthy by `prisma migrate status` prior to running.
 *
 * Do NOT repurpose this script for other migrations without understanding
 * what it does. The safe remediation for checksum drift is to update the
 * stored checksum to match a file that you have verified produces the same
 * schema as what is already in the DB — i.e. this script is only safe when
 * `migrate status` reports the DB as healthy.
 *
 * Usage
 *   node node_modules/tsx/dist/cli.mjs scripts/repair-phase7a-migration-checksum.ts
 *     --> dry run, prints before/after without writing
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/repair-phase7a-migration-checksum.ts --confirm
 *     --> actually updates the checksum
 */

const MIGRATION_NAME = "20260416120000_phase7a_rendr_structured_fields";

async function main() {
  const confirm = process.argv.includes("--confirm");
  const mode = confirm ? "WRITE" : "DRY RUN";
  const startedAt = new Date().toISOString();
  console.log(`=== repair-phase7a-migration-checksum (${mode}) ===`);
  console.log(`started-at: ${startedAt}`);
  console.log(`target migration: ${MIGRATION_NAME}`);
  console.log();

  // ─── Step 1: verify schema is up-to-date BEFORE changing anything ────────
  console.log("Step 1 — prisma migrate status (must report healthy):");
  let statusOutput = "";
  try {
    statusOutput = execSync("npx prisma migrate status", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    statusOutput =
      (e.stdout ?? "") + (e.stderr ?? "") + (e.message ? `\n${e.message}` : "");
  }
  console.log(
    statusOutput
      .split("\n")
      .map((l) => `  | ${l}`)
      .join("\n"),
  );
  if (!/Database schema is up to date/i.test(statusOutput)) {
    console.error();
    console.error(
      "ABORT: prisma migrate status does not report the schema as up-to-date.",
    );
    console.error(
      "This script only rewrites checksum metadata; it cannot resolve real schema drift.",
    );
    console.error("Investigate the migration state before rerunning.");
    process.exit(2);
  }
  console.log();

  // ─── Step 2: compute current file checksum ────────────────────────────────
  const sqlPath = join(
    process.cwd(),
    "prisma/migrations",
    MIGRATION_NAME,
    "migration.sql",
  );
  const sqlBytes = readFileSync(sqlPath);
  const newChecksum = createHash("sha256").update(sqlBytes).digest("hex");
  console.log("Step 2 — current file on disk:");
  console.log(`  path:     ${sqlPath}`);
  console.log(`  size:     ${sqlBytes.length} bytes`);
  console.log(`  sha-256:  ${newChecksum}`);
  console.log();

  // ─── Step 3: fetch + print the before row ─────────────────────────────────
  const before = await prisma.$queryRawUnsafe<
    Array<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
      applied_steps_count: number;
      started_at: Date;
    }>
  >(
    `SELECT migration_name, checksum, finished_at, applied_steps_count, started_at
     FROM "_prisma_migrations"
     WHERE migration_name = $1`,
    MIGRATION_NAME,
  );
  if (before.length === 0) {
    console.error(
      `ABORT: no _prisma_migrations row found for ${MIGRATION_NAME}.`,
    );
    await prisma.$disconnect();
    process.exit(3);
  }
  const row = before[0];
  console.log("Step 3 — BEFORE (_prisma_migrations row):");
  console.log(`  migration_name:      ${row.migration_name}`);
  console.log(`  checksum (stored):   ${row.checksum}`);
  console.log(`  finished_at:         ${row.finished_at?.toISOString() ?? "(null)"}`);
  console.log(`  applied_steps_count: ${row.applied_steps_count}`);
  console.log(`  started_at:          ${row.started_at.toISOString()}`);
  console.log();

  if (row.checksum === newChecksum) {
    console.log(
      "Stored checksum already matches file. Nothing to repair. Exiting.",
    );
    await prisma.$disconnect();
    return;
  }

  if (!confirm) {
    console.log("DRY RUN — no write issued.");
    console.log(
      `To apply: re-run with --confirm. The UPDATE will set checksum ${row.checksum} -> ${newChecksum}.`,
    );
    await prisma.$disconnect();
    return;
  }

  // ─── Step 4: write + print the after row ─────────────────────────────────
  console.log("Step 4 — issuing UPDATE _prisma_migrations SET checksum ...");
  await prisma.$executeRawUnsafe(
    `UPDATE "_prisma_migrations" SET checksum = $1 WHERE migration_name = $2`,
    newChecksum,
    MIGRATION_NAME,
  );

  const after = await prisma.$queryRawUnsafe<
    Array<{ migration_name: string; checksum: string }>
  >(
    `SELECT migration_name, checksum FROM "_prisma_migrations" WHERE migration_name = $1`,
    MIGRATION_NAME,
  );
  const newRow = after[0];
  console.log();
  console.log("Step 4 — AFTER (_prisma_migrations row):");
  console.log(`  migration_name:    ${newRow.migration_name}`);
  console.log(`  checksum (stored): ${newRow.checksum}`);
  console.log();
  console.log(`finished-at: ${new Date().toISOString()}`);
  console.log("=== done ===");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
