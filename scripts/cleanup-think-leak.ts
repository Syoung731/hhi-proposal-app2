import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * One-off cleanup for Phase 8A bug #1. Clears retainerDescription values
 * that match the placeholder fragment ("Think"), where a past user input
 * landed the placeholder word into the actual field.
 *
 * Pass --confirm to apply. Without it, prints what would change.
 */
async function main() {
  const confirm = process.argv.includes("--confirm");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const slides = await prisma.deckSlide.findMany({
    where: { type: "investment-by-space" },
    select: { id: true, deckId: true, content: true },
  });

  const hits: { id: string; before: string }[] = [];
  for (const slide of slides) {
    const c = (slide.content as Record<string, unknown> | null) ?? {};
    const desc = String(c.retainerDescription ?? "").trim();
    // Match only exact "Think" or the exact placeholder fragment — safer than
    // any substring match to avoid nuking legitimate user prose.
    if (desc === "Think" || desc === "Think of this as an insurance policy...") {
      hits.push({ id: slide.id, before: desc });
    }
  }

  if (hits.length === 0) {
    console.log("No slides need cleanup. Bug #1 is clean.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${hits.length} slide(s) with placeholder-leak retainerDescription:`);
  for (const h of hits) {
    console.log(`  ${h.id}: ${JSON.stringify(h.before)}`);
  }

  if (!confirm) {
    console.log("\nDry run. Re-run with --confirm to clear these values.");
    await prisma.$disconnect();
    return;
  }

  for (const h of hits) {
    const slide = await prisma.deckSlide.findUnique({
      where: { id: h.id },
      select: { content: true },
    });
    const c = (slide?.content as Record<string, unknown> | null) ?? {};
    await prisma.deckSlide.update({
      where: { id: h.id },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: { ...c, retainerDescription: null } as any,
      },
    });
    console.log(`  cleared retainerDescription on ${h.id}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
