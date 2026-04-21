// Focused test: exercise upsertCatalogSuggestion directly to verify
//   (1) new-row insert path
//   (2) update path: occurrenceCount += 1 and running-avg math
//   (3) concurrency: 10 parallel upserts to the same itemName produce
//       deterministic final count and mathematically-correct avg
import { prisma } from "../../app/lib/prisma";
import { randomUUID } from "node:crypto";

const TEST_NAME = `__smoke_${randomUUID().slice(0, 8)}`;

// Internal: same SQL as production upsertCatalogSuggestion.
async function upsert(unitPrice: number, unitCost: number) {
  await prisma.$executeRaw`
    INSERT INTO "CatalogSuggestion" (
      "id", "itemName", "tradeGroup", "suggestedUnit",
      "avgUnitPrice", "avgUnitCost", "occurrenceCount",
      "status", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${TEST_NAME}, 'TestTrade', 'EA',
      ${unitPrice}, ${unitCost}, 1,
      'pending', NOW(), NOW()
    )
    ON CONFLICT ("itemName") DO UPDATE SET
      "avgUnitPrice"    = (COALESCE("CatalogSuggestion"."avgUnitPrice", 0) * "CatalogSuggestion"."occurrenceCount" + EXCLUDED."avgUnitPrice") / ("CatalogSuggestion"."occurrenceCount" + 1),
      "avgUnitCost"     = (COALESCE("CatalogSuggestion"."avgUnitCost",  0) * "CatalogSuggestion"."occurrenceCount" + EXCLUDED."avgUnitCost")  / ("CatalogSuggestion"."occurrenceCount" + 1),
      "occurrenceCount" = "CatalogSuggestion"."occurrenceCount" + 1,
      "tradeGroup"      = EXCLUDED."tradeGroup",
      "suggestedUnit"   = EXCLUDED."suggestedUnit",
      "updatedAt"       = NOW()
  `;
}

async function read() {
  return prisma.catalogSuggestion.findUnique({
    where: { itemName: TEST_NAME },
    select: { id: true, occurrenceCount: true, avgUnitPrice: true, avgUnitCost: true },
  });
}

function fmt(n: number | null | undefined, d = 4) { return n == null ? "null" : n.toFixed(d); }

async function main() {
  try {
    // --- (1) insert path ---
    process.stdout.write(`=== INSERT PATH (first write) ===\n`);
    await upsert(100, 50);
    let row = await read();
    process.stdout.write(`count=${row?.occurrenceCount} avgPrice=${fmt(row?.avgUnitPrice)} avgCost=${fmt(row?.avgUnitCost)}\n`);
    const idFmt = row && /^[0-9a-f]{8}-[0-9a-f]{4}/.test(row.id) ? "uuid" : "cuid/other";
    process.stdout.write(`id=${row?.id} (${idFmt})\n`);
    if (row?.occurrenceCount !== 1 || row?.avgUnitPrice !== 100 || row?.avgUnitCost !== 50) {
      throw new Error("INSERT math wrong");
    }

    // --- (2) update path ---
    process.stdout.write(`\n=== UPDATE PATH (2nd write, price=200 cost=100) ===\n`);
    await upsert(200, 100);
    row = await read();
    process.stdout.write(`count=${row?.occurrenceCount} avgPrice=${fmt(row?.avgUnitPrice)} avgCost=${fmt(row?.avgUnitCost)}\n`);
    // Expected: count=2, avgPrice=(100*1+200)/2=150, avgCost=(50*1+100)/2=75
    if (row?.occurrenceCount !== 2 || Math.abs((row.avgUnitPrice ?? 0) - 150) > 0.0001 || Math.abs((row.avgUnitCost ?? 0) - 75) > 0.0001) {
      throw new Error(`UPDATE math wrong: expected count=2 avgPrice=150 avgCost=75, got count=${row?.occurrenceCount} avgPrice=${row?.avgUnitPrice} avgCost=${row?.avgUnitCost}`);
    }

    // --- (3) concurrency ---
    process.stdout.write(`\n=== CONCURRENCY (10 parallel upserts, each price=300 cost=150) ===\n`);
    // After 10 more writes with value=300, total count = 12.
    // Running avg: each new write i adds (300 - oldAvg_{i-1}) / (i+1) to the avg.
    // Simpler check: final avg should equal weighted mean of all observed values.
    // We have: 1x(100) + 1x(200) + 10x(300) = 100 + 200 + 3000 = 3300 across 12 writes.
    // Expected avgPrice = 3300 / 12 = 275; avgCost = (50 + 100 + 10*150) / 12 = 1650/12 = 137.5
    await Promise.all(Array.from({ length: 10 }, () => upsert(300, 150)));
    row = await read();
    process.stdout.write(`count=${row?.occurrenceCount} avgPrice=${fmt(row?.avgUnitPrice)} avgCost=${fmt(row?.avgUnitCost)}\n`);
    process.stdout.write(`expected: count=12 avgPrice=275.0000 avgCost=137.5000\n`);
    if (row?.occurrenceCount !== 12) {
      throw new Error(`CONCURRENCY count wrong: got ${row?.occurrenceCount} expected 12 (lost writes!)`);
    }
    const priceErr = Math.abs((row.avgUnitPrice ?? 0) - 275);
    const costErr = Math.abs((row.avgUnitCost ?? 0) - 137.5);
    if (priceErr > 0.01 || costErr > 0.01) {
      throw new Error(`CONCURRENCY math wrong: priceErr=${priceErr.toFixed(4)} costErr=${costErr.toFixed(4)} (race condition!)`);
    }

    process.stdout.write(`\n=== PASS: insert + update + 10-parallel concurrency all correct ===\n`);
  } finally {
    await prisma.catalogSuggestion.deleteMany({ where: { itemName: TEST_NAME } });
    await prisma.$disconnect();
  }
}
main().catch(e => { console.error("FAIL:", e); process.exit(1); });
