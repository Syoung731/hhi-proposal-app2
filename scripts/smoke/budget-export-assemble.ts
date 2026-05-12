/**
 * Smoke test for app/lib/budget-export/assemble.ts.
 *
 * Run:
 *   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/smoke/budget-export-assemble.ts <projectId>
 *
 * Validates:
 *   - assembler returns without throwing for a real project
 *   - room ordering puts COPE last
 *   - per-room totals sum to project totals
 *   - per-row low/high have fallback applied (never zero when target > 0)
 *   - per-row totalPrice sums to per-group target sums to per-room target
 *   - skipped rooms (no estimate) are listed, not silently dropped
 *
 * Exits non-zero on math drift so this can be wired into a CI gate later.
 */
import { prisma } from "../../app/lib/prisma";
import { assembleProjectBudget } from "../../app/lib/budget-export/assemble";

const projectIdArg = process.argv[2];

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function approxEq(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) < eps;
}

async function pickProjectId(): Promise<string> {
  if (projectIdArg) return projectIdArg;
  // Auto-pick: first project with at least one AIEstimate.
  const candidate = await prisma.aIEstimate.findFirst({
    select: { projectId: true, project: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!candidate) {
    throw new Error("No AIEstimate rows found — pass a projectId explicitly.");
  }
  process.stdout.write(
    `(no projectId arg; auto-picked latest estimate's project: ${candidate.project.title})\n`,
  );
  return candidate.projectId;
}

async function main() {
  const projectId = await pickProjectId();

  process.stdout.write(`=== assembleProjectBudget(${projectId}) ===\n`);
  const t0 = Date.now();
  const exp = await assembleProjectBudget(projectId);
  const ms = Date.now() - t0;
  process.stdout.write(`elapsed: ${ms}ms\n\n`);

  process.stdout.write(`Project: ${exp.project.title}\n`);
  process.stdout.write(`Client:  ${exp.project.clientName ?? "(none)"}\n`);
  process.stdout.write(`Rooms exported:  ${exp.rooms.length}\n`);
  process.stdout.write(`Rooms skipped:   ${exp.skippedRoomNames.length}`);
  if (exp.skippedRoomNames.length) {
    process.stdout.write(`  — ${exp.skippedRoomNames.join(", ")}`);
  }
  process.stdout.write(`\n`);
  process.stdout.write(
    `Range pct: low=${exp.rangeLowPct}%, high=${exp.rangeHighPct}%\n\n`,
  );

  let failures = 0;
  const fail = (msg: string) => {
    failures++;
    process.stdout.write(`  ✗ ${msg}\n`);
  };

  process.stdout.write(`=== Per-room check ===\n`);
  let copeIndex = -1;
  for (let i = 0; i < exp.rooms.length; i++) {
    const room = exp.rooms[i];
    if (room.isProjectOverhead) copeIndex = i;
    process.stdout.write(
      `  ${room.isProjectOverhead ? "[COPE] " : ""}${room.name}: ` +
        `target=$${fmt(room.totals.target)} ` +
        `range=$${fmt(room.totals.low)}–$${fmt(room.totals.high)} ` +
        `items=${room.totals.itemCount} ` +
        `groups=${room.tradeGroups.length}\n`,
    );

    // Verify per-row low/high have fallback applied.
    for (const g of room.tradeGroups) {
      for (const item of g.items) {
        if (item.totalPrice > 0) {
          if (item.totalPriceLow <= 0)
            fail(
              `row "${item.name}" has totalPrice=${item.totalPrice} but low=${item.totalPriceLow}`,
            );
          if (item.totalPriceHigh <= 0)
            fail(
              `row "${item.name}" has totalPrice=${item.totalPrice} but high=${item.totalPriceHigh}`,
            );
        }
      }
    }

    // Verify per-group target = sum of per-row targets.
    for (const g of room.tradeGroups) {
      const rowSum = g.items.reduce((s, i) => s + i.totalPrice, 0);
      if (!approxEq(rowSum, g.totals.target)) {
        fail(
          `${room.name} > ${g.tradeGroup}: target=${g.totals.target} but rows sum to ${rowSum}`,
        );
      }
    }

    // Verify per-room target = sum of per-group targets.
    const groupSum = room.tradeGroups.reduce(
      (s, g) => s + g.totals.target,
      0,
    );
    if (!approxEq(groupSum, room.totals.target)) {
      fail(
        `${room.name}: room target=${room.totals.target} but groups sum to ${groupSum}`,
      );
    }
  }

  // COPE placement — should be last in the rooms array (if present).
  if (copeIndex >= 0 && copeIndex !== exp.rooms.length - 1) {
    fail(
      `COPE room at index ${copeIndex} but rooms.length=${exp.rooms.length} — should be last`,
    );
  }

  // Project totals = sum of per-room totals.
  const roomSumTarget = exp.rooms.reduce((s, r) => s + r.totals.target, 0);
  const roomSumLow = exp.rooms.reduce((s, r) => s + r.totals.low, 0);
  const roomSumHigh = exp.rooms.reduce((s, r) => s + r.totals.high, 0);
  if (!approxEq(roomSumTarget, exp.totals.target)) {
    fail(
      `project target=${exp.totals.target} but rooms sum to ${roomSumTarget}`,
    );
  }
  if (!approxEq(roomSumLow, exp.totals.low)) {
    fail(`project low=${exp.totals.low} but rooms sum to ${roomSumLow}`);
  }
  if (!approxEq(roomSumHigh, exp.totals.high)) {
    fail(`project high=${exp.totals.high} but rooms sum to ${roomSumHigh}`);
  }

  process.stdout.write(`\n=== Project totals ===\n`);
  process.stdout.write(`Items:  ${exp.totals.itemCount}\n`);
  process.stdout.write(`Target: $${fmt(exp.totals.target)}\n`);
  process.stdout.write(`Range:  $${fmt(exp.totals.low)} – $${fmt(exp.totals.high)}\n`);
  process.stdout.write(`Cost:   $${fmt(exp.totals.cost)}\n\n`);

  if (failures > 0) {
    process.stdout.write(`✗ ${failures} check(s) failed\n`);
    await prisma.$disconnect();
    process.exit(1);
  }
  process.stdout.write(`✓ all checks passed\n`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`smoke failure: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  await prisma.$disconnect();
  process.exit(1);
});
