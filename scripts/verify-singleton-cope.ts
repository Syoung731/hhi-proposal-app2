import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/app/lib/prisma";

/**
 * Pass 2 Cluster B verification. Confirms the four partial unique indexes
 * exist in pg_indexes with the expected predicates. Postgres unique-index
 * enforcement is deterministic, so the metadata check is equivalent in
 * confidence to attempting a duplicate insert (without polluting data).
 */
async function main() {
  const idx = await prisma.$queryRawUnsafe<{ schemaname: string; tablename: string; indexname: string; indexdef: string }[]>(`
    SELECT schemaname, tablename, indexname, indexdef
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

  console.log(`Pass-2 Cluster B partial unique indexes found: ${idx.length} / 4 expected`);
  for (const i of idx) console.log(`  ${i.indexname}\n    ${i.indexdef}`);

  const expected = [
    { name: "CompanySettings_singleton", mustContain: ["UNIQUE", "ON public.\"CompanySettings\"", "(true)"] },
    { name: "Company_singleton", mustContain: ["UNIQUE", "ON public.\"Company\"", "(true)"] },
    { name: "CompanyContext_singleton", mustContain: ["UNIQUE", "ON public.\"CompanyContext\"", "(true)"] },
    { name: "Room_one_cope_per_project", mustContain: ["UNIQUE", "ON public.\"Room\"", "\"projectId\"", "WHERE", "\"isProjectOverhead\""] },
  ];

  let pass = idx.length === 4;
  for (const e of expected) {
    const found = idx.find((i) => i.indexname === e.name);
    if (!found) {
      console.log(`  FAIL: missing ${e.name}`);
      pass = false;
      continue;
    }
    for (const token of e.mustContain) {
      if (!found.indexdef.includes(token)) {
        console.log(`  FAIL: ${e.name} indexdef missing token "${token}"`);
        pass = false;
      }
    }
  }

  // Sanity: row-count snapshot to confirm constraints didn't violate existing data.
  const cs = await prisma.companySettings.count();
  const co = await prisma.company.count();
  const cc = await prisma.companyContext.count();
  const totalCope = await prisma.room.count({ where: { isProjectOverhead: true } });
  const projectsWithCope = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT COUNT(DISTINCT "projectId")::text AS n FROM "Room" WHERE "isProjectOverhead" = true`,
  );

  console.log(`\nRow-count snapshot:`);
  console.log(`  CompanySettings: ${cs} (must be <= 1)`);
  console.log(`  Company:         ${co} (must be <= 1)`);
  console.log(`  CompanyContext:  ${cc} (must be <= 1)`);
  console.log(`  COPE rooms:      ${totalCope} across ${projectsWithCope[0].n} project(s) — must be 1:1`);

  if (cs > 1 || co > 1 || cc > 1) pass = false;
  if (Number(totalCope) !== Number(projectsWithCope[0].n)) pass = false;

  console.log(`\n${pass ? "PASS" : "FAIL"}`);
  await prisma.$disconnect();
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
