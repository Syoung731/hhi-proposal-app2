import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * One-off cleanup for Phase 8A bug #7. Removes COPE-style entries from
 * scope-breakdown slides' content.rooms[]. These entries leaked into the
 * "Additional Areas Included" list before syncScopeBreakdownSlide filtered
 * by isProjectOverhead. The component now defends at render time too — this
 * script cleans the persisted data so the UI inspector isn't confusing.
 *
 * Pass --confirm to apply. Without it, prints what would change.
 */
async function main() {
  const confirm = process.argv.includes("--confirm");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const slides = await prisma.deckSlide.findMany({
    where: { type: "scope-breakdown" },
    select: { id: true, deckId: true, content: true },
  });

  const isCope = (name: string) => /cost of project execution|\bcope\b/i.test(name.trim());

  type Change = { id: string; removed: string[] };
  const changes: Change[] = [];

  for (const slide of slides) {
    const c = (slide.content as Record<string, unknown> | null) ?? {};
    const rooms = Array.isArray(c.rooms) ? (c.rooms as Record<string, unknown>[]) : [];
    const kept = rooms.filter((r) => !isCope(String(r?.name ?? "")));
    if (kept.length === rooms.length) continue;
    const removed = rooms.filter((r) => isCope(String(r?.name ?? ""))).map((r) => String(r?.name ?? ""));
    changes.push({ id: slide.id, removed });

    if (confirm) {
      await prisma.deckSlide.update({
        where: { id: slide.id },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: { ...c, rooms: kept } as any,
        },
      });
    }
  }

  if (changes.length === 0) {
    console.log(`Clean. ${slides.length} scope-breakdown slides scanned; no COPE leakage.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${changes.length} slide(s) with COPE-style rooms${confirm ? " (CLEANED)" : " (dry run)"}:`);
  for (const c of changes) {
    console.log(`  ${c.id}  removed: ${c.removed.map((n) => JSON.stringify(n)).join(", ")}`);
  }

  if (!confirm) {
    console.log("\nDry run. Re-run with --confirm to apply the cleanup.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
