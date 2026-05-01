import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { KNOWN_SLIDE_TYPES } from "../app/lib/deck/types";

/**
 * One-shot diagnostic: enumerate any `DeckSlide.type` strings in the dev
 * DB that aren't in the current `KNOWN_SLIDE_TYPES` registry. Surfaces
 * any further orphans beyond the 6 strings cleaned up in C.6-A.
 *
 * Read-only — no writes, no deletes.
 */
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const grouped = await prisma.deckSlide.groupBy({
      by: ["type"],
      _count: { _all: true },
    });

    const orphans = grouped.filter((g) => !KNOWN_SLIDE_TYPES.has(g.type));
    if (orphans.length === 0) {
      console.log("No orphan DeckSlide types — every row's type is in the current registry.");
      return;
    }

    console.log(`Found ${orphans.length} orphan slide type(s):`);
    for (const o of orphans) {
      console.log(`  ${o.type.padEnd(30)} ${o._count._all} row(s)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
