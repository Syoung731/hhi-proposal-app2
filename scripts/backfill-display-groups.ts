/**
 * Phase 8A.1 T1 backfill.
 *
 * Populates Room.displayGroupId + Room.displayGroupOrder for every row where
 * displayGroupId IS NULL (i.e., every row after the migration — all existing
 * rooms lack a value).
 *
 * For each project:
 *   1. Classify every Room (using the classifier + siblings on the same project)
 *   2. Group by slug
 *   3. Within each slug, sort rooms alphabetically by name
 *   4. Write displayGroupId + displayGroupOrder = index
 *
 * Dry run by default. Pass --confirm to apply.
 *
 * Usage:
 *   npx tsx scripts/backfill-display-groups.ts           # dry run
 *   npx tsx scripts/backfill-display-groups.ts --confirm # apply
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  classifyRoomToDisplayGroup,
  type RoomForClassification,
} from "../app/lib/investment/display-group-classifier";

async function main() {
  const confirm = process.argv.includes("--confirm");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    // Read every Room on every project — we backfill across the whole DB.
    const rooms = await prisma.room.findMany({
      select: {
        id: true,
        projectId: true,
        name: true,
        isProjectOverhead: true,
        displayGroupId: true,
      },
    });

    const byProject = new Map<string, RoomForClassification[]>();
    for (const r of rooms) {
      const arr = byProject.get(r.projectId) ?? [];
      arr.push({ id: r.id, name: r.name, isProjectOverhead: r.isProjectOverhead });
      byProject.set(r.projectId, arr);
    }

    type Write = { id: string; displayGroupId: string; displayGroupOrder: number };
    const writes: Write[] = [];
    let skippedAlreadySet = 0;

    for (const [projectId, siblings] of byProject) {
      // Classify every room on this project once.
      const classified = siblings.map((r) => ({
        room: r,
        slug: classifyRoomToDisplayGroup(r, siblings),
      }));

      // Group by slug, then sort each group alphabetically by room name.
      const groups = new Map<string, { id: string; name: string }[]>();
      for (const { room, slug } of classified) {
        const arr = groups.get(slug) ?? [];
        arr.push({ id: room.id, name: room.name });
        groups.set(slug, arr);
      }
      for (const arr of groups.values()) {
        arr.sort((a, b) => a.name.localeCompare(b.name));
      }

      // Queue writes.
      for (const [slug, arr] of groups) {
        for (let i = 0; i < arr.length; i++) {
          const row = rooms.find((r) => r.id === arr[i].id)!;
          if (row.displayGroupId !== null) {
            skippedAlreadySet++;
            continue;
          }
          writes.push({ id: arr[i].id, displayGroupId: slug, displayGroupOrder: i });
        }
      }

      if (!confirm) {
        console.log(`\n${projectId}  (${siblings.length} rooms)`);
        for (const [slug, arr] of groups) {
          console.log(`  [${slug}]`);
          for (let i = 0; i < arr.length; i++) {
            console.log(`    ${i}  ${arr[i].name}`);
          }
        }
      }
    }

    console.log(
      `\nPlanned writes: ${writes.length}  (skipping ${skippedAlreadySet} rooms with displayGroupId already set)`
    );

    if (!confirm) {
      console.log("\nDry run. Re-run with --confirm to apply.");
      return;
    }

    // Apply in a transaction — batch updates keyed by id.
    await prisma.$transaction(
      writes.map((w) =>
        prisma.room.update({
          where: { id: w.id },
          data: { displayGroupId: w.displayGroupId, displayGroupOrder: w.displayGroupOrder },
        })
      )
    );
    console.log(`\nApplied ${writes.length} writes.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
