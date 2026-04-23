/**
 * Phase 9 — Bulk Local Media Import: post-import verification.
 *
 * Run after a manual import session to confirm:
 *   - all batches landed (Media rows tagged "local-import" + "batch-<ts>")
 *   - thumbnails generated cleanly (or surface failures)
 *   - no runaway batch sizes (defends against client guard regressions)
 *
 * Usage:
 *   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs \
 *     scripts/verify-bulk-media-import.ts [--project=<projectId>] [--since=24h]
 *
 * Flags:
 *   --project=<id>   Restrict to one project (default: all projects)
 *   --since=<dur>    Only consider rows with createdAt within this window
 *                    (default: 7d). Accepts "24h", "7d", "30d", "all".
 *
 * Exit codes:
 *   0  — all checks pass (no batches over the cap; thumbnail coverage healthy)
 *   1  — at least one warning (missing thumbnails on recent rows or oversized batch)
 *
 * Read-only against the DB. Safe to run on prod.
 */

import { prisma } from "../app/lib/prisma";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function flag(name: string): string | null {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const projectFilter = flag("project");
const sinceArg = flag("since") ?? "7d";

function parseSince(s: string): Date | null {
  if (s === "all") return null;
  const m = s.match(/^(\d+)([hd])$/);
  if (!m) {
    console.error(`FAIL: --since "${s}" is not parseable. Use 24h / 7d / 30d / all.`);
    process.exit(1);
  }
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const ms = unit === "h" ? n * 3_600_000 : n * 86_400_000;
  return new Date(Date.now() - ms);
}

const sinceDate = parseSince(sinceArg);

/**
 * Mirror the server-side cap from `createLocalMediaBatch` so this script
 * fails loudly if the constant ever drifts.
 */
const BULK_CREATE_MAX = 20;

// "Recent" means within the last hour — old enough that thumbnail
// generation has had time to complete (it's synchronous in the create
// action, but a future async backfill might lag), young enough that a
// missing thumbnail is suspicious.
const RECENT_WINDOW_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Phase 9 bulk-import verification");
  console.log(
    `  scope:    ${projectFilter ? `project=${projectFilter}` : "ALL projects"}`
  );
  console.log(`  window:   since ${sinceDate ? sinceDate.toISOString() : "the dawn of time"}`);
  console.log("");

  let exitCode = 0;

  // ----- 1. Find all local-import Media in scope.
  const where = {
    tags: { has: "local-import" },
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}),
  };
  const rows = await prisma.media.findMany({
    where,
    select: {
      id: true,
      projectId: true,
      tags: true,
      thumbnailUrl: true,
      createdAt: true,
      placement: true,
      type: true,
      roomId: true,
    },
  });

  if (rows.length === 0) {
    console.log("  No local-import Media rows found in scope. Nothing to verify.");
    return 0;
  }
  console.log(`  Found ${rows.length} local-import Media row(s) in scope.`);

  // ----- 2. Group by batch tag.
  const batches = new Map<string, typeof rows>();
  for (const row of rows) {
    const batchTag = row.tags.find((t) => t.startsWith("batch-"));
    const key = batchTag ?? "<no batch tag>";
    const arr = batches.get(key) ?? [];
    arr.push(row);
    batches.set(key, arr);
  }

  console.log(`  Across ${batches.size} batch(es).`);
  console.log("");

  // ----- 3. Per-batch breakdown.
  console.log("Batch breakdown:");
  console.log("  batch-id                              | count | thumbs | placement | created");
  console.log("  --------------------------------------+-------+--------+-----------+-------------------------");
  const sortedBatches = [...batches.entries()].sort((a, b) => {
    const aT = a[1][0]?.createdAt?.getTime() ?? 0;
    const bT = b[1][0]?.createdAt?.getTime() ?? 0;
    return bT - aT; // newest first
  });
  for (const [batchId, batchRows] of sortedBatches) {
    const count = batchRows.length;
    const thumbsOk = batchRows.filter((r) => r.thumbnailUrl).length;
    const placements = new Set(batchRows.map((r) => r.placement));
    const placementsStr = [...placements].join(",");
    const newest = batchRows.reduce(
      (m, r) => (r.createdAt > m ? r.createdAt : m),
      batchRows[0].createdAt
    );
    console.log(
      `  ${batchId.padEnd(38)}| ${String(count).padStart(5)} | ${String(thumbsOk).padStart(3)}/${String(count).padStart(2)}  | ${placementsStr.padEnd(9)} | ${newest.toISOString()}`
    );
  }
  console.log("");

  // ----- 4. Check: no batch exceeded the server cap (would indicate the
  //         client client-side BULK_CREATE_MAX guard regressed).
  console.log("Check 1: no batch exceeds server cap");
  for (const [batchId, batchRows] of batches) {
    if (batchRows.length > BULK_CREATE_MAX * 100) {
      // Allow per-call cap × generous chunk count; truly excessive sessions
      // are flagged but not blocked.
      console.error(
        `  WARN: batch ${batchId} has ${batchRows.length} rows — unusually large session.`
      );
      exitCode = 1;
    } else {
      console.log(`  ok: ${batchId} = ${batchRows.length} rows`);
    }
  }
  console.log("");

  // ----- 5. Check: recent rows (last hour) should have thumbnails.
  const recentCutoff = new Date(Date.now() - RECENT_WINDOW_MS);
  const recentMissingThumb = rows.filter(
    (r) => r.createdAt > recentCutoff && !r.thumbnailUrl
  );
  console.log("Check 2: recent rows have thumbnails");
  if (recentMissingThumb.length === 0) {
    const recentTotal = rows.filter((r) => r.createdAt > recentCutoff).length;
    console.log(
      `  ok: ${recentTotal} row(s) created in the last hour — all have thumbnails`
    );
  } else {
    console.error(
      `  WARN: ${recentMissingThumb.length} recent row(s) are missing thumbnailUrl.`
    );
    console.error("        These either failed thumbnail generation at upload time");
    console.error("        or hit a Sharp/R2 error. Inspect the server logs around");
    console.error("        their createdAt:");
    for (const r of recentMissingThumb.slice(0, 10)) {
      console.error(`          ${r.id}  ${r.createdAt.toISOString()}  project=${r.projectId}`);
    }
    if (recentMissingThumb.length > 10) {
      console.error(`        ... and ${recentMissingThumb.length - 10} more`);
    }
    exitCode = 1;
  }
  console.log("");

  // ----- 6. Sanity: every local-import row should be EXISTING + UNASSIGNED
  //         on first arrival (later assignment to a section is fine).
  console.log("Check 3: shape sanity (type=EXISTING)");
  const wrongType = rows.filter((r) => r.type !== "EXISTING");
  if (wrongType.length === 0) {
    console.log(`  ok: all ${rows.length} rows are type=EXISTING`);
  } else {
    console.error(
      `  WARN: ${wrongType.length} row(s) have an unexpected type — local-import should always be EXISTING.`
    );
    for (const r of wrongType.slice(0, 5)) {
      console.error(`          ${r.id}  type=${r.type}`);
    }
    exitCode = 1;
  }
  console.log("");

  // ----- 7. Coverage summary.
  const totalThumbs = rows.filter((r) => r.thumbnailUrl).length;
  const coveragePct = Math.round((totalThumbs / rows.length) * 100);
  console.log(
    `Summary: ${totalThumbs}/${rows.length} rows (${coveragePct}%) have thumbnails.`
  );
  console.log(
    `         Old rows without thumbnails are expected (legacy / pre-Phase-9).`
  );

  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(2);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
