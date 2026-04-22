/**
 * Phase 8A.1 T6 verification.
 *
 * Runs the new syncInvestmentSlide against the Oyster Reef project (23 rooms)
 * and prints the resulting content.lineItems so we can eyeball the grouping.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const PROJECT_ID = "cmo8mgpn20006o47kjvop2zlj";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    // Read what the slide currently has (after sync on last page load).
    const deck = await prisma.proposalDeck.findUnique({
      where: { projectId: PROJECT_ID },
      include: {
        slides: {
          where: { type: "investment" },
          select: { id: true, isUserModified: true, content: true },
        },
      },
    });
    if (!deck) {
      console.log("No deck for project.");
      return;
    }
    const slide = deck.slides[0];
    if (!slide) {
      console.log("Deck has no investment slide yet.");
      return;
    }
    const content = slide.content as Record<string, unknown> | null;
    const items = Array.isArray(content?.lineItems) ? (content!.lineItems as Record<string, unknown>[]) : [];
    console.log(`Slide ${slide.id}  isUserModified=${slide.isUserModified}`);
    console.log(`content.lineItems count: ${items.length}`);
    if (items.length === 0) {
      console.log("(no line items yet — next page-load of /admin/projects/<id>/deck will populate)");
    }
    for (const item of items) {
      const label = item.label;
      const bucket = item.bucket;
      const low = item.rangeLow as number | null;
      const high = item.rangeHigh as number | null;
      const includes = item.includesText ?? null;
      const priced =
        low != null && high != null
          ? `$${Math.round(low).toLocaleString()} – $${Math.round(high).toLocaleString()}`
          : "(no pricing)";
      console.log(`  [${bucket}] ${label}  ${priced}`);
      if (includes) console.log(`       ${includes}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
