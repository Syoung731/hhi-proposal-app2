/**
 * Backfill script: retag pre-calculated permit line items from AI_PRICED → CALC.
 *
 * Targets EstimateLineItem rows whose `name` matches one of the well-known
 * pre-calculated permit fee items emitted by app/lib/cope-estimate-prompt.ts.
 *
 * The values for these line items have always been pre-calculated in code by
 * app/lib/permit-fee-calculator.ts and passed through unchanged. They were
 * mis-tagged AI_PRICED only because the COPE template catalog did not contain
 * matching entries, so the parser fell through to the AI_PRICED default.
 *
 * USAGE
 *   1. DRY RUN (default — prints what would change, makes no edits):
 *        npx tsx scripts/backfill-calc-source-tag.ts
 *
 *   2. APPLY (actually update the rows):
 *        npx tsx scripts/backfill-calc-source-tag.ts --apply
 *
 * SAFETY
 *   - Only retags rows whose `source` is currently exactly "AI_PRICED".
 *   - Only matches the two confirmed pre-calc names (case-insensitive).
 *   - Never touches CATALOG / ALLOWANCE / MANUAL / CALC rows.
 *   - Prints a per-row summary before doing anything.
 */

import { prisma } from "../app/lib/prisma";

const TARGET_NAMES = [
  "[ADM] Building Permit - Material",
  "[ADM] Plan Review Fee",
];

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`[backfill-calc] Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`[backfill-calc] Targets: ${TARGET_NAMES.join(", ")}`);

  const candidates = await prisma.estimateLineItem.findMany({
    where: {
      source: "AI_PRICED",
      name: { in: TARGET_NAMES },
    },
    select: {
      id: true,
      estimateId: true,
      name: true,
      unitPrice: true,
      totalPrice: true,
      source: true,
    },
  });

  console.log(`[backfill-calc] Found ${candidates.length} candidate row(s).`);
  for (const row of candidates) {
    console.log(
      `  - ${row.id}  estimate=${row.estimateId}  name="${row.name}"  unitPrice=$${row.unitPrice}  total=$${row.totalPrice}`,
    );
  }

  if (!apply) {
    console.log(`[backfill-calc] Dry run complete. Re-run with --apply to update.`);
    return;
  }

  if (candidates.length === 0) {
    console.log(`[backfill-calc] Nothing to update.`);
    return;
  }

  const result = await prisma.estimateLineItem.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { source: "CALC" },
  });

  console.log(`[backfill-calc] Updated ${result.count} row(s) → source = "CALC".`);
}

main()
  .catch((err) => {
    console.error("[backfill-calc] FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
