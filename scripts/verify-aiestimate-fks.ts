import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/app/lib/prisma";

/**
 * One-shot verification for Pass 2 Cluster A4. Confirms the AIEstimate FK
 * constraints exist in the DB with the expected CASCADE behavior.
 *
 * Cheap metadata check — equivalent in confidence to a manual cascade test
 * in Prisma Studio because Postgres FK enforcement is deterministic: if the
 * constraint says CASCADE, the cascade WILL fire.
 */
async function main() {
  const fks = await prisma.$queryRawUnsafe<
    { name: string; col: string; ref_table: string; ref_col: string; on_delete: string }[]
  >(`
    SELECT con.conname AS name,
           att.attname AS col,
           ref.relname AS ref_table,
           refatt.attname AS ref_col,
           con.confdeltype::text AS on_delete
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_attribute refatt ON refatt.attrelid = con.confrelid AND refatt.attnum = ANY(con.confkey)
    WHERE cl.relname = 'AIEstimate' AND con.contype = 'f'
    ORDER BY con.conname
  `);

  console.log(`AIEstimate FK constraints found: ${fks.length}`);
  const names = ["c", "n", "a", "r", "d"].reduce<Record<string, string>>(
    (acc, k) => ({ ...acc, [k]: { c: "CASCADE", n: "SET NULL", a: "NO ACTION", r: "RESTRICT", d: "SET DEFAULT" }[k]! }),
    {},
  );
  for (const f of fks) {
    console.log(`  ${f.name}: ${f.col} -> ${f.ref_table}.${f.ref_col}  onDelete=${names[f.on_delete] ?? f.on_delete}`);
  }

  const expected = [
    { name: "AIEstimate_projectId_fkey", col: "projectId", ref_table: "Project", on_delete: "c" },
    { name: "AIEstimate_roomTemplateId_fkey", col: "roomTemplateId", ref_table: "RoomTemplate", on_delete: "n" },
    { name: "AIEstimate_sectionId_fkey", col: "sectionId", ref_table: "Room", on_delete: "c" },
  ];
  let pass = true;
  for (const e of expected) {
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

  // Sanity: count current AIEstimate rows that would be cascade-deleted if their parent went away.
  const aiCount = await prisma.aIEstimate.count();
  const orphanProject = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT COUNT(*)::text AS n FROM "AIEstimate" ai LEFT JOIN "Project" p ON p.id = ai."projectId" WHERE p.id IS NULL`,
  );
  const orphanRoom = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT COUNT(*)::text AS n FROM "AIEstimate" ai LEFT JOIN "Room" r ON r.id = ai."sectionId" WHERE r.id IS NULL`,
  );

  console.log(`\nAIEstimate rows: ${aiCount}`);
  console.log(`  with orphan projectId: ${orphanProject[0].n} (must be 0 — FK rejects inserts of dangling refs)`);
  console.log(`  with orphan sectionId: ${orphanRoom[0].n} (must be 0)`);

  console.log(`\n${pass && Number(orphanProject[0].n) === 0 && Number(orphanRoom[0].n) === 0 ? "PASS" : "FAIL"}`);

  await prisma.$disconnect();
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
