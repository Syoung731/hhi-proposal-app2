import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/app/lib/prisma";

/**
 * Pass 2 Cluster B pre-flight. Confirms the partial unique indexes can be
 * applied without violating existing data:
 *
 *   - CompanySettings, Company, CompanyContext must each have row count <= 1
 *     (singleton enforcement is a partial unique index on `((true))` —
 *      attempting it against a table with 2+ rows fails immediately).
 *   - No project may have more than one Room WHERE isProjectOverhead = true
 *     (the COPE-per-project partial unique index requires this).
 *
 * Read-only.
 */
async function main() {
  let pass = true;

  const cs = await prisma.companySettings.count();
  const co = await prisma.company.count();
  const cc = await prisma.companyContext.count();

  console.log("Singleton row counts (each must be 0 or 1):");
  console.log(`  CompanySettings: ${cs}${cs > 1 ? "  ← BLOCKER" : ""}`);
  console.log(`  Company:         ${co}${co > 1 ? "  ← BLOCKER" : ""}`);
  console.log(`  CompanyContext:  ${cc}${cc > 1 ? "  ← BLOCKER" : ""}`);
  if (cs > 1 || co > 1 || cc > 1) pass = false;

  const dupes = await prisma.$queryRawUnsafe<{ projectId: string; cnt: string }[]>(`
    SELECT "projectId", COUNT(*)::text AS cnt
    FROM "Room"
    WHERE "isProjectOverhead" = true
    GROUP BY "projectId"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `);
  console.log(`\nProjects with > 1 COPE Room: ${dupes.length}${dupes.length > 0 ? "  ← BLOCKER" : ""}`);
  for (const d of dupes.slice(0, 10)) console.log(`  projectId=${d.projectId}  COPE rooms=${d.cnt}`);
  if (dupes.length > 10) console.log(`  ...(${dupes.length - 10} more)`);
  if (dupes.length > 0) pass = false;

  const totalCope = await prisma.room.count({ where: { isProjectOverhead: true } });
  const projectsWithCope = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT COUNT(DISTINCT "projectId")::text AS n FROM "Room" WHERE "isProjectOverhead" = true`,
  );
  console.log(`\nTotal COPE rooms: ${totalCope} across ${projectsWithCope[0].n} project(s)`);

  console.log(`\n${pass ? "PASS — safe to apply Cluster B migration" : "FAIL — must resolve blockers before migration"}`);
  await prisma.$disconnect();
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
