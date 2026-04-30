import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const PROJECT_ID = "cmo8mgpn20006o47kjvop2zlj";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log("═══ ISSUE 1 — InvestmentLineItem state ═══");
  const ili = await prisma.investmentLineItem.findMany({
    where: { projectId: PROJECT_ID },
    orderBy: { sortOrder: "asc" },
  });
  console.log(`InvestmentLineItem count: ${ili.length}`);
  if (ili.length > 0) {
    console.log("First 5 rows (full):");
    for (const r of ili.slice(0, 5)) {
      console.log(`  ${JSON.stringify(r, null, 2)}`);
    }
  }

  console.log("\n═══ ISSUE 1 — Room-level pricing (per-section source) ═══");
  const rooms = await prisma.room.findMany({
    where: { projectId: PROJECT_ID },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      sortOrder: true,
      bucket: true,
      totalLow: true,
      totalTarget: true,
      totalHigh: true,
      isProjectOverhead: true,
      selectedRenderMediaId: true,
      scopeNarrative: true,
    },
  });
  console.log(`Room count: ${rooms.length}`);
  for (const r of rooms) {
    console.log(`  ${r.name}  bucket=${r.bucket}  totals=(${r.totalLow}/${r.totalTarget}/${r.totalHigh})  selectedRenderMediaId=${r.selectedRenderMediaId ?? "null"}  isProjectOverhead=${r.isProjectOverhead}`);
  }

  console.log("\n═══ ISSUE 1 — Deck investment slide content ═══");
  const deck = await prisma.proposalDeck.findUnique({
    where: { projectId: PROJECT_ID },
    include: {
      slides: {
        where: { type: "investment-by-space" },
        select: { id: true, content: true, isUserModified: true, source: true },
      },
    },
  });
  if (!deck) {
    console.log("  NO DECK for this project");
  } else {
    console.log(`  deckId: ${deck.id}`);
    console.log(`  investment slides: ${deck.slides.length}`);
    for (const s of deck.slides) {
      const c = s.content as Record<string, unknown> | null;
      const items = Array.isArray(c?.lineItems) ? c?.lineItems.length : 0;
      console.log(`    slide ${s.id}  isUserModified=${s.isUserModified}  source=${s.source}  content.lineItems count=${items}`);
      if (c) {
        console.log(`    content.lineItems first row: ${JSON.stringify((c.lineItems as unknown[])?.[0] ?? null)}`);
      }
    }
  }

  console.log("\n═══ ISSUE 2 — Media by type ═══");
  const mediaCounts = await prisma.media.groupBy({
    by: ["type", "renderStatus"],
    where: { projectId: PROJECT_ID },
    _count: { _all: true },
  });
  for (const m of mediaCounts) {
    console.log(`  type=${m.type}  renderStatus=${m.renderStatus}  count=${m._count._all}`);
  }

  const renderings = await prisma.media.findMany({
    where: { projectId: PROJECT_ID, type: "RENDERING" },
    select: {
      id: true,
      roomId: true,
      sourceMediaId: true,
      renderStatus: true,
      parentMediaId: true,
      url: true,
    },
  });
  console.log(`\nRENDERING media rows: ${renderings.length}`);
  for (const r of renderings.slice(0, 10)) {
    console.log(`  ${r.id}  roomId=${r.roomId ?? "null"}  renderStatus=${r.renderStatus}  parentMediaId=${r.parentMediaId ?? "null"}  sourceMediaId=${r.sourceMediaId ?? "null"}`);
  }

  console.log("\n═══ ISSUE 2 — Rooms with selected renders + before media ═══");
  const roomsWithMedia = await prisma.room.findMany({
    where: { projectId: PROJECT_ID },
    select: {
      id: true,
      name: true,
      selectedRenderMediaId: true,
      isProjectOverhead: true,
      media: {
        select: { id: true, type: true, kind: true, renderStatus: true, url: true },
      },
    },
  });
  let eligibleCount = 0;
  for (const r of roomsWithMedia) {
    const before = r.media.filter((m) => m.type === "EXISTING");
    const renders = r.media.filter((m) => m.type === "RENDERING" && m.renderStatus === "DONE");
    const hasSelected = !!r.selectedRenderMediaId;
    const hasBefore = before.length > 0;
    const eligible = hasSelected && hasBefore && !r.isProjectOverhead;
    if (eligible) eligibleCount++;
    console.log(
      `  ${r.name}  isProjectOverhead=${r.isProjectOverhead}  before=${before.length}  renders(DONE)=${renders.length}  selectedRenderMediaId=${hasSelected ? "SET" : "null"}  → before-after eligible? ${eligible}`
    );
  }
  console.log(`\nTotal before-after eligible rooms: ${eligibleCount}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
