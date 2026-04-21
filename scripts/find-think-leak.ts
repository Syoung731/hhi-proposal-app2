import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const slides = await prisma.deckSlide.findMany({
    where: { type: "investment" },
    select: { id: true, deckId: true, content: true },
  });

  let hits = 0;
  for (const slide of slides) {
    const c = (slide.content as Record<string, unknown> | null) ?? {};
    const desc = String(c.retainerDescription ?? "");
    const disc = String(c.disclaimer ?? "");
    const hit = desc.includes("Think") || desc.includes("insurance policy") || disc.includes("Think") || disc.includes("insurance policy");
    if (hit) {
      hits++;
      console.log(`  slide ${slide.id} (deck ${slide.deckId})`);
      console.log(`    retainerDescription: ${JSON.stringify(desc.substring(0, 200))}`);
      console.log(`    disclaimer:          ${JSON.stringify(disc.substring(0, 200))}`);
    }
  }

  console.log(`\nScanned ${slides.length} investment slides; ${hits} contain "Think" or "insurance policy" in retainerDescription/disclaimer.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
