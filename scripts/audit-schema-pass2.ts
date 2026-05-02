/**
 * READ-ONLY schema audit for Web Readiness Pass 2.
 * Dumps DB-level metadata (columns, indexes, FKs, constraints) for comparison
 * against prisma/schema.prisma. No writes.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/app/lib/prisma";

type RawRow = Record<string, unknown>;

async function dumpSection(title: string, rows: RawRow[]) {
  console.log(`\n===== ${title} (${rows.length} rows) =====`);
  for (const r of rows) console.log(JSON.stringify(r, (_k, v) => typeof v === "bigint" ? v.toString() : v));
}

async function main() {
  // 1. All columns with type, nullable, default, identity
  const columns = await prisma.$queryRawUnsafe<RawRow[]>(`
    SELECT
      c.table_name,
      c.column_name,
      c.ordinal_position,
      c.data_type,
      c.udt_name,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.is_nullable,
      c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name NOT LIKE '\\_%' ESCAPE '\\'
    ORDER BY c.table_name, c.ordinal_position;
  `);
  await dumpSection("COLUMNS", columns);

  // 2. All indexes per table
  const indexes = await prisma.$queryRawUnsafe<RawRow[]>(`
    SELECT
      t.relname AS table_name,
      i.relname AS index_name,
      ix.indisunique AS is_unique,
      ix.indisprimary AS is_primary,
      pg_get_indexdef(ix.indexrelid) AS def
    FROM pg_class t
    JOIN pg_index ix ON ix.indrelid = t.oid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relkind = 'r'
      AND t.relname NOT LIKE '\\_%' ESCAPE '\\'
    ORDER BY t.relname, i.relname;
  `);
  await dumpSection("INDEXES", indexes);

  // 3. All foreign keys with cascade behavior
  const fks = await prisma.$queryRawUnsafe<RawRow[]>(`
    SELECT
      con.conname AS constraint_name,
      cl.relname AS table_name,
      att.attname AS column_name,
      cl_ref.relname AS ref_table,
      att_ref.attname AS ref_column,
      con.confupdtype::text AS on_update,
      con.confdeltype::text AS on_delete
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    JOIN pg_class cl_ref ON cl_ref.oid = con.confrelid
    JOIN pg_attribute att_ref ON att_ref.attrelid = con.confrelid AND att_ref.attnum = ANY(con.confkey)
    WHERE con.contype = 'f' AND nsp.nspname = 'public'
    ORDER BY cl.relname, con.conname;
  `);
  await dumpSection("FOREIGN_KEYS", fks);

  // 4. Unique constraints
  const uniques = await prisma.$queryRawUnsafe<RawRow[]>(`
    SELECT
      tc.table_name,
      tc.constraint_name,
      kc.column_name,
      kc.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kc
      ON kc.constraint_name = tc.constraint_name
      AND kc.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name, kc.ordinal_position;
  `);
  await dumpSection("UNIQUE_CONSTRAINTS", uniques);

  // 5. Check constraints
  const checks = await prisma.$queryRawUnsafe<RawRow[]>(`
    SELECT
      tc.table_name,
      tc.constraint_name,
      cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc USING (constraint_schema, constraint_name)
    WHERE tc.constraint_type = 'CHECK' AND tc.table_schema = 'public'
    ORDER BY tc.table_name;
  `);
  await dumpSection("CHECK_CONSTRAINTS", checks);

  // 6. Migration history table
  const migrations = await prisma.$queryRawUnsafe<RawRow[]>(`
    SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations
    ORDER BY started_at;
  `);
  await dumpSection("MIGRATIONS_APPLIED", migrations);

  // 7. Migration count + any anomalies
  const migAnomalies = await prisma.$queryRawUnsafe<RawRow[]>(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE finished_at IS NULL)::int AS unfinished,
           COUNT(*) FILTER (WHERE rolled_back_at IS NOT NULL)::int AS rolled_back
    FROM _prisma_migrations;
  `);
  await dumpSection("MIGRATION_ANOMALIES", migAnomalies);

  // 8. Row counts per table (sanity check)
  const tables = await prisma.$queryRawUnsafe<RawRow[]>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name NOT LIKE '\\_%' ESCAPE '\\'
    ORDER BY table_name;
  `);
  console.log(`\n===== ROW_COUNTS =====`);
  for (const t of tables) {
    const tname = t.table_name as string;
    try {
      const c = await prisma.$queryRawUnsafe<RawRow[]>(`SELECT COUNT(*)::text AS n FROM "${tname}";`);
      console.log(`${tname}\t${c[0].n}`);
    } catch (e) {
      console.log(`${tname}\tERR ${(e as Error).message}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
