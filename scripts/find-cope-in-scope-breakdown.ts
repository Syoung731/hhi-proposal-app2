import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const slides = await prisma.deckSlide.findMany({
    where: { type: "scope-breakdown" },
    select: { id: true, deckId: true, headline: true, content: true },
  });

  const hits: { id: string; reason: string; snippet: string }[] = [];
  for (const slide of slides) {
    const c = (slide.content as Record<string, unknown> | null) ?? {};
    const title = String(c.title ?? "").trim();
    const headline = String(slide.headline ?? "").trim();
    const rooms = Array.isArray(c.rooms) ? c.rooms : [];

    if (/cost of project execution/i.test(title)) {
      hits.push({ id: slide.id, reason: "content.title has COPE", snippet: title });
    }
    if (/cost of project execution/i.test(headline)) {
      hits.push({ id: slide.id, reason: "slide.headline has COPE", snippet: headline });
    }

    for (const r of rooms) {
      if (!r || typeof r !== "object") continue;
      const name = String((r as { name?: unknown }).name ?? "").trim();
      if (/cost of project execution|\bcope\b/i.test(name)) {
        hits.push({ id: slide.id, reason: "room name is COPE", snippet: name });
      }
    }
  }

  if (hits.length === 0) {
    console.log(`Scanned ${slides.length} scope-breakdown slides. No COPE leakage found.`);
  } else {
    console.log(`Found ${hits.length} COPE leakage hits across ${slides.length} scope-breakdown slides:`);
    for (const h of hits) {
      console.log(`  ${h.id}  [${h.reason}]  ${JSON.stringify(h.snippet)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
