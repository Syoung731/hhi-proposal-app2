// Smoke test: exercises generate-room-estimate.ts directly against real DB + Anthropic.
// Run: npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/smoke/single-room.ts
import { prisma } from "../../app/lib/prisma";
import { generateRoomEstimate } from "../../app/lib/ai/generate-room-estimate";

const ROOM_ID = "cmo8mm54g000no47kzoz75ugr";
const PROJECT_ID = "cmo8mgpn20006o47kjvop2zlj";
const TEMPLATE_ID = "cmnf4d3p916dbew7knteol76o";

function fmt(n: number | null | undefined, d = 2) {
  return n == null ? "null" : n.toFixed(d);
}

async function main() {
  const room = await prisma.room.findUnique({
    where: { id: ROOM_ID },
    select: { name: true, scopeNarrative: true },
  });
  if (!room) throw new Error(`Room ${ROOM_ID} not found`);

  const preCount = await prisma.catalogSuggestion.count();
  const preTop = await prisma.catalogSuggestion.findMany({
    select: { itemName: true, occurrenceCount: true, avgUnitPrice: true, avgUnitCost: true },
    orderBy: { occurrenceCount: "desc" },
    take: 10,
  });
  const preMap = new Map(preTop.map(r => [r.itemName, r] as const));

  process.stdout.write(`=== PRE-STATE ===\n`);
  process.stdout.write(`room: ${room.name}, scope=${room.scopeNarrative.length} chars\n`);
  process.stdout.write(`catalog_suggestion_rows: ${preCount}\n`);
  process.stdout.write(`top-5 by occurrence:\n`);
  for (const r of preTop.slice(0, 5)) {
    process.stdout.write(`  ${r.itemName} | count=${r.occurrenceCount} | avgPrice=${fmt(r.avgUnitPrice)} | avgCost=${fmt(r.avgUnitCost)}\n`);
  }

  process.stdout.write(`\n=== generateRoomEstimate() ===\n`);
  const t0 = Date.now();
  const result = await generateRoomEstimate({
    projectId: PROJECT_ID,
    sectionId: ROOM_ID,
    roomTemplateId: TEMPLATE_ID,
    scopeNarrative: room.scopeNarrative,
  });
  const elapsed = Date.now() - t0;
  process.stdout.write(`elapsed=${(elapsed / 1000).toFixed(1)}s\n`);
  process.stdout.write(`estimate_id: ${result.estimate.id}\n`);
  process.stdout.write(`status: ${result.estimate.status}\n`);
  process.stdout.write(`totalCost: $${fmt(result.estimate.totalCost, 2)}\n`);
  process.stdout.write(`totalPrice: $${fmt(result.estimate.totalPrice, 2)}\n`);
  process.stdout.write(`line_items: ${result.estimate.lineItems.length}\n`);
  process.stdout.write(`tokens: prompt=${result.usage.promptTokens} completion=${result.usage.completionTokens}\n`);
  process.stdout.write(`warnings: ${JSON.stringify(result.warnings)}\n`);

  const bySource = result.estimate.lineItems.reduce<Record<string, number>>((acc, li) => {
    acc[li.source] = (acc[li.source] ?? 0) + 1;
    return acc;
  }, {});
  process.stdout.write(`source_counts: ${JSON.stringify(bySource)}\n`);

  const aiItems = result.estimate.lineItems.filter(li => li.source === "AI_PRICED");
  process.stdout.write(`\n=== AI_PRICED ITEMS (${aiItems.length}) ===\n`);
  for (const li of aiItems.slice(0, 12)) {
    process.stdout.write(`  ${li.name} | ${li.tradeGroup} | qty=${li.quantity} ${li.unit} @ $${fmt(li.unitPrice)} = $${fmt(li.totalPrice)}\n`);
  }

  const postCount = await prisma.catalogSuggestion.count();
  process.stdout.write(`\n=== POST-STATE ===\n`);
  process.stdout.write(`catalog_suggestion_rows: ${postCount} (delta ${postCount - preCount})\n`);

  process.stdout.write(`\n=== SPOT-CHECK: CatalogSuggestion for first 3 AI_PRICED items ===\n`);
  for (const li of aiItems.slice(0, 3)) {
    const sug = await prisma.catalogSuggestion.findUnique({
      where: { itemName: li.name },
      select: { id: true, itemName: true, occurrenceCount: true, avgUnitPrice: true, avgUnitCost: true, tradeGroup: true, suggestedUnit: true },
    });
    if (!sug) { process.stdout.write(`  NO ROW for "${li.name}" (!)\n`); continue; }
    const prev = preMap.get(li.name);
    const idShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sug.id) ? "uuid" : "cuid";
    if (prev) {
      // Math check: expectedNewAvg = (oldAvg * oldCount + li.unitPrice) / (oldCount + 1)
      const expectedAvgPrice = ((prev.avgUnitPrice ?? 0) * prev.occurrenceCount + li.unitPrice) / (prev.occurrenceCount + 1);
      const actualAvgPrice = sug.avgUnitPrice ?? 0;
      const delta = Math.abs(expectedAvgPrice - actualAvgPrice);
      const mathOk = delta < 0.02 ? "\u2713" : `MISMATCH (\u0394=${fmt(delta, 4)})`;
      process.stdout.write(`  "${sug.itemName}" id=${idShape}\n`);
      process.stdout.write(`    count: ${prev.occurrenceCount} -> ${sug.occurrenceCount} (expected +1)\n`);
      process.stdout.write(`    avgPrice: $${fmt(prev.avgUnitPrice)} -> $${fmt(sug.avgUnitPrice)} (expected $${fmt(expectedAvgPrice)}) ${mathOk}\n`);
      process.stdout.write(`    avgCost:  $${fmt(prev.avgUnitCost)} -> $${fmt(sug.avgUnitCost)}\n`);
      process.stdout.write(`    observed on this call: unitPrice=$${fmt(li.unitPrice)} unitCost=?\n`);
    } else {
      // New row
      process.stdout.write(`  "${sug.itemName}" id=${idShape} (NEW) count=${sug.occurrenceCount} avgPrice=${fmt(sug.avgUnitPrice)} avgCost=${fmt(sug.avgUnitCost)}\n`);
    }
  }

  process.stdout.write(`\n=== QUALITY SAMPLE: one line item per trade group ===\n`);
  const uniqueTrades = Array.from(new Set(result.estimate.lineItems.map(li => li.tradeGroup)));
  for (const trade of uniqueTrades) {
    const first = result.estimate.lineItems.find(li => li.tradeGroup === trade);
    if (first) process.stdout.write(`  [${trade}] ${first.name} | qty=${first.quantity} ${first.unit} @ $${fmt(first.unitPrice)} | ${first.source}\n`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
