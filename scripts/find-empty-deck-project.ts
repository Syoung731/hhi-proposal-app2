import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // Find projects that have no deck slides yet — good candidates for empty-state testing.
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      title: true,
      client1First: true,
      client1Last: true,
      proposalDeck: { select: { id: true, _count: { select: { slides: true } } } },
      _count: { select: { rooms: true } },
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  console.log("Most recent 20 projects, deck state:");
  for (const p of projects) {
    const slideCount = p.proposalDeck?._count.slides ?? 0;
    const deckState = p.proposalDeck ? `deck[${p.proposalDeck.id}]=${slideCount} slides` : "NO DECK";
    console.log(
      `  ${p.id}  rooms=${p._count.rooms}  title="${p.title ?? "<none>"}"  client="${p.client1First ?? ""} ${p.client1Last ?? ""}"  ${deckState}`
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
