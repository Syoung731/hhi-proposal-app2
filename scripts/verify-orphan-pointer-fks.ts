import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/app/lib/prisma";

/**
 * Pass 2 Cluster C verification.
 *
 * Confirms:
 *   - DeckSlide.sectionId FK -> Room.id with ON DELETE SET NULL
 *   - Project.coverHeroImageId FK -> Media.id with ON DELETE SET NULL
 *
 * AND regression-checks Cluster B's COPE partial unique index. The Cluster C
 * migration scaffold initially included a `DROP INDEX "Room_one_cope_per_project"`
 * line that would have silently undone Cluster B; the manual edit removed it.
 * This script proves the COPE index still exists after the Cluster C migration
 * applied, plus the three singleton indexes from Cluster B.
 *
 * Postgres constraint enforcement is deterministic — metadata check is
 * equivalent in confidence to attempting a duplicate insert / cascade delete.
 */
async function main() {
  let pass = true;

  // --- New FKs from Cluster C ---
  const fks = await prisma.$queryRawUnsafe<{
    name: string;
    table: string;
    col: string;
    ref_table: string;
    ref_col: string;
    on_delete: string;
  }[]>(`
    SELECT con.conname AS name,
           cl.relname AS "table",
           att.attname AS col,
           ref.relname AS ref_table,
           refatt.attname AS ref_col,
           con.confdeltype::text AS on_delete
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_attribute refatt ON refatt.attrelid = con.confrelid AND refatt.attnum = ANY(con.confkey)
    WHERE con.conname IN ('DeckSlide_sectionId_fkey', 'Project_coverHeroImageId_fkey')
      AND con.contype = 'f'
    ORDER BY con.conname
  `);

  console.log(`Cluster C new FKs found: ${fks.length} / 2 expected`);
  const onDeleteLabel: Record<string, string> = { c: "CASCADE", n: "SET NULL", a: "NO ACTION", r: "RESTRICT", d: "SET DEFAULT" };
  for (const f of fks) {
    console.log(`  ${f.name}: ${f.table}.${f.col} -> ${f.ref_table}.${f.ref_col}  onDelete=${onDeleteLabel[f.on_delete] ?? f.on_delete}`);
  }

  const expectedFks = [
    { name: "DeckSlide_sectionId_fkey", table: "DeckSlide", col: "sectionId", ref_table: "Room", on_delete: "n" },
    { name: "Project_coverHeroImageId_fkey", table: "Project", col: "coverHeroImageId", ref_table: "Media", on_delete: "n" },
  ];
  for (const e of expectedFks) {
    const found = fks.find((f) => f.name === e.name);
    if (!found) {
      console.log(`  FAIL: missing ${e.name}`);
      pass = false;
      continue;
    }
    if (found.col !== e.col || found.ref_table !== e.ref_table || found.on_delete !== e.on_delete) {
      console.log(`  FAIL: ${e.name} mismatch (got col=${found.col} ref=${found.ref_table} onDelete=${found.on_delete})`);
      pass = false;
    }
  }

  // --- REGRESSION CHECK: Cluster B partial unique indexes must still exist ---
  const idx = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'CompanySettings_singleton',
        'Company_singleton',
        'CompanyContext_singleton',
        'Room_one_cope_per_project'
      )
    ORDER BY indexname
  `);

  console.log(`\nCluster B partial unique indexes (regression check): ${idx.length} / 4 expected`);
  for (const i of idx) console.log(`  ${i.indexname}`);

  const expectedIdx = [
    "CompanySettings_singleton",
    "Company_singleton",
    "CompanyContext_singleton",
    "Room_one_cope_per_project",
  ];
  for (const name of expectedIdx) {
    if (!idx.find((i) => i.indexname === name)) {
      console.log(`  FAIL: missing ${name} — Cluster B regression!`);
      pass = false;
    }
  }

  // --- Sanity: orphan counts must remain 0 (FK rejects new dangling refs) ---
  const orphanDeck = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT COUNT(*)::text AS n FROM "DeckSlide" ds LEFT JOIN "Room" r ON r.id = ds."sectionId" WHERE ds."sectionId" IS NOT NULL AND r.id IS NULL`,
  );
  const orphanProj = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT COUNT(*)::text AS n FROM "Project" p LEFT JOIN "Media" m ON m.id = p."coverHeroImageId" WHERE p."coverHeroImageId" IS NOT NULL AND m.id IS NULL`,
  );
  console.log(`\nOrphan-pointer sanity:`);
  console.log(`  DeckSlide rows with orphan sectionId: ${orphanDeck[0].n} (must be 0)`);
  console.log(`  Project rows with orphan coverHeroImageId: ${orphanProj[0].n} (must be 0)`);
  if (Number(orphanDeck[0].n) !== 0 || Number(orphanProj[0].n) !== 0) pass = false;

  console.log(`\n${pass ? "PASS" : "FAIL"}`);
  await prisma.$disconnect();
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
