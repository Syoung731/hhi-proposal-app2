import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "@/app/lib/prisma";

/**
 * Pass 2 Cluster D1 pre-flight. Confirms the three "redundant" indexes from
 * the audit are genuinely covered by a unique index/constraint that includes
 * the same column(s) as a leftmost prefix — not just plausibly redundant.
 *
 * Targets:
 *   - ZillowBrowserConnection.nonce_idx       covered by nonce_key (unique)
 *   - Proposal.projectId_idx                  covered by projectId_key (unique)
 *   - InvestmentLineItem.projectId_idx        covered by (projectId, bucket) unique
 */
async function main() {
  const candidates: { table: string; redundant: string; covers: string }[] = [
    { table: "ZillowBrowserConnection", redundant: "ZillowBrowserConnection_nonce_idx", covers: "ZillowBrowserConnection_nonce_key" },
    { table: "Proposal", redundant: "Proposal_projectId_idx", covers: "Proposal_projectId_key" },
    { table: "InvestmentLineItem", redundant: "InvestmentLineItem_projectId_idx", covers: "InvestmentLineItem_projectId_bucket_key" },
  ];

  let pass = true;

  for (const c of candidates) {
    const rows = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string; is_unique: boolean }[]>(`
      SELECT i.relname AS indexname,
             pg_get_indexdef(ix.indexrelid) AS indexdef,
             ix.indisunique AS is_unique
      FROM pg_class t
      JOIN pg_index ix ON ix.indrelid = t.oid
      JOIN pg_class i ON i.oid = ix.indexrelid
      WHERE t.relname = '${c.table}'
        AND i.relname IN ('${c.redundant}', '${c.covers}')
      ORDER BY i.relname
    `);

    console.log(`\n${c.table}:`);
    const redundant = rows.find((r) => r.indexname === c.redundant);
    const covers = rows.find((r) => r.indexname === c.covers);
    console.log(`  redundant: ${redundant ? redundant.indexdef : "MISSING"}`);
    console.log(`  covers:    ${covers ? covers.indexdef : "MISSING"}`);

    if (!redundant) {
      console.log(`  WARN: ${c.redundant} not present — may already be dropped or never existed`);
      continue;
    }
    if (!covers) {
      console.log(`  FAIL: ${c.covers} not present — cannot safely drop ${c.redundant}`);
      pass = false;
      continue;
    }
    if (!covers.is_unique) {
      console.log(`  FAIL: ${c.covers} is not unique — does not subsume ${c.redundant}`);
      pass = false;
      continue;
    }

    // Confirm the redundant column appears as the leftmost column in the covers index def.
    // pg_get_indexdef format example: 'CREATE UNIQUE INDEX X ON t USING btree ("col1", "col2")'
    const colMatch = redundant.indexdef.match(/\(([^)]+)\)/);
    const coversColMatch = covers.indexdef.match(/\(([^)]+)\)/);
    if (!colMatch || !coversColMatch) {
      console.log(`  FAIL: could not parse column lists`);
      pass = false;
      continue;
    }
    const redundantCols = colMatch[1].split(",").map((s) => s.trim());
    const coversCols = coversColMatch[1].split(",").map((s) => s.trim());

    if (redundantCols.length !== 1) {
      console.log(`  FAIL: redundant index has multiple columns — not a simple prefix-redundancy case`);
      pass = false;
      continue;
    }
    if (coversCols[0] !== redundantCols[0]) {
      console.log(`  FAIL: covers index leftmost col=${coversCols[0]} does not match redundant col=${redundantCols[0]}`);
      pass = false;
      continue;
    }

    console.log(`  PASS: drop is safe`);
  }

  console.log(`\n${pass ? "PASS — all 3 candidates are genuinely redundant" : "FAIL — at least one candidate cannot be safely dropped"}`);
  await prisma.$disconnect();
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
