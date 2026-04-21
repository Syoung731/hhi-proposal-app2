import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const slides = await prisma.deckSlide.findMany({
    select: {
      id: true,
      type: true,
      deckId: true,
      headline: true,
      subheadline: true,
      body: true,
      content: true,
    },
  });

  console.log(`Scanned ${slides.length} slides across ALL types\n`);

  const target = "A transparent 5-Stage process";
  const findings: Array<{ id: string; type: string; field: string; snippet: string; count: number }> = [];

  function countOccurrences(haystack: string | null | undefined, needle: string): number {
    if (!haystack) return 0;
    const lower = haystack.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    let count = 0;
    let idx = 0;
    while ((idx = lower.indexOf(lowerNeedle, idx)) !== -1) {
      count++;
      idx += lowerNeedle.length;
    }
    return count;
  }

  function detectAnyDuplicateSentence(text: string | null | undefined): string | null {
    if (!text || text.length < 20) return null;
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);
    const seen = new Map<string, number>();
    for (const s of sentences) {
      seen.set(s, (seen.get(s) ?? 0) + 1);
    }
    for (const [s, c] of seen) {
      if (c >= 2) return s;
    }
    return null;
  }

  for (const slide of slides) {
    const fields: Array<[string, string | null | undefined]> = [
      ["headline", slide.headline],
      ["subheadline", slide.subheadline],
      ["body", slide.body],
    ];

    if (slide.content && typeof slide.content === "object") {
      const contentStr = JSON.stringify(slide.content);
      fields.push(["content(json)", contentStr]);
    }

    for (const [fieldName, text] of fields) {
      if (!text) continue;
      const targetCount = countOccurrences(text, target);
      if (targetCount >= 2) {
        findings.push({
          id: slide.id,
          type: slide.type,
          field: fieldName,
          snippet: text.substring(0, 200),
          count: targetCount,
        });
      }
      const dup = detectAnyDuplicateSentence(text);
      if (dup && targetCount < 2) {
        findings.push({
          id: slide.id,
          type: slide.type,
          field: fieldName + " (duplicate-sentence detect)",
          snippet: dup.substring(0, 200),
          count: 2,
        });
      }
    }
  }

  if (findings.length === 0) {
    console.log("RESULT: No slides contain duplicate sentences matching the bug #4 pattern.");
    console.log(`Searched for exact phrase: "${target}"`);
    console.log("Also ran general duplicate-sentence detection — no matches.");
  } else {
    console.log(`RESULT: Found ${findings.length} potential matches:\n`);
    for (const f of findings) {
      console.log(`  Slide ${f.id} (type=${f.type}, field=${f.field}, occurrences=${f.count})`);
      console.log(`    snippet: ${f.snippet}`);
      console.log();
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
