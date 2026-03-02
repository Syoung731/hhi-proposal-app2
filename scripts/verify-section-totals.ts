/**
 * Verification script for deterministic Section (Room) totals.
 * Run: npx tsx scripts/verify-section-totals.ts
 *
 * Rules verified:
 * - effectiveUnit = estimateUnit ?? sectionType.defaultEstimateUnit ?? SF
 * - qty = unitQuantity, unless (effectiveUnit === CUSTOM && (unitQuantity is null or <= 0)) then qty = 1
 * - totalLow = unitRateLow != null ? round(unitRateLow * qty, 0) : null
 * - totalTarget = unitRateTarget != null ? round(unitRateTarget * qty, 0) : null
 * - totalHigh = unitRateHigh != null ? round(unitRateHigh * qty, 0) : null
 *
 * Optionally run against DB: npx tsx scripts/verify-section-totals.ts --db
 */

import {
  computeSectionTotals,
  getEffectiveEstimateUnit,
  getEffectiveQty,
  type RoomLikeForTotals,
  type SectionTypeLikeForTotals,
} from "../app/lib/section-totals";
import type { EstimateUnit } from "../app/generated/prisma";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function eq<T>(a: T, b: T, msg: string) {
  const ok =
    a === b ||
    (Number.isNaN(a as number) && Number.isNaN(b as number)) ||
    (a != null && b != null && Math.abs((a as number) - (b as number)) < 1e-9);
  assert(ok, `${msg}: expected ${b}, got ${a}`);
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

console.log("Section totals computation — verification\n");

// effectiveUnit
test("effectiveUnit: room.estimateUnit wins", () => {
  const unit = getEffectiveEstimateUnit(
    { estimateUnit: "LF" as EstimateUnit },
    { defaultEstimateUnit: "SF" as EstimateUnit }
  );
  eq(unit, "LF", "effectiveUnit");
});

test("effectiveUnit: sectionType default when room null", () => {
  const unit = getEffectiveEstimateUnit(
    { estimateUnit: null },
    { defaultEstimateUnit: "EA" as EstimateUnit }
  );
  eq(unit, "EA", "effectiveUnit");
});

test("effectiveUnit: SF when both null", () => {
  const unit = getEffectiveEstimateUnit({}, null);
  eq(unit, "SF", "effectiveUnit");
});

// effective qty
test("qty: unitQuantity when not CUSTOM", () => {
  eq(getEffectiveQty(10, "SF" as EstimateUnit), 10, "qty");
});

test("qty: CUSTOM and unitQuantity null => 1", () => {
  eq(getEffectiveQty(null, "CUSTOM" as EstimateUnit), 1, "qty");
});

test("qty: CUSTOM and unitQuantity 0 => 1", () => {
  eq(getEffectiveQty(0, "CUSTOM" as EstimateUnit), 1, "qty");
});

test("qty: CUSTOM and unitQuantity 5 => 5", () => {
  eq(getEffectiveQty(5, "CUSTOM" as EstimateUnit), 5, "qty");
});

// computeSectionTotals
test("totals: round(rate * qty, 0)", () => {
  const room: RoomLikeForTotals = {
    estimateUnit: "SF",
    unitQuantity: 100,
    unitRateLow: 50.4,
    unitRateTarget: 60,
    unitRateHigh: 70.6,
  };
  const t = computeSectionTotals(room, null);
  eq(t.qty, 100, "qty");
  eq(t.totalLow, 5040, "totalLow"); // 50.4 * 100
  eq(t.totalTarget, 6000, "totalTarget");
  eq(t.totalHigh, 7060, "totalHigh"); // 70.6 * 100
});

test("totals: null rate => null total", () => {
  const room: RoomLikeForTotals = {
    unitQuantity: 10,
    unitRateLow: null,
    unitRateTarget: 20,
    unitRateHigh: null,
  };
  const t = computeSectionTotals(room, null);
  eq(t.totalLow, null, "totalLow");
  eq(t.totalTarget, 200, "totalTarget");
  eq(t.totalHigh, null, "totalHigh");
});

test("totals: CUSTOM qty 0 => qty 1", () => {
  const room: RoomLikeForTotals = {
    estimateUnit: "CUSTOM" as EstimateUnit,
    unitQuantity: 0,
    unitRateTarget: 100,
  };
  const t = computeSectionTotals(room, null);
  eq(t.qty, 1, "qty");
  eq(t.totalTarget, 100, "totalTarget");
});

test("totals: sectionType defaultEstimateUnit used when room.estimateUnit null", () => {
  const room: RoomLikeForTotals = {
    estimateUnit: null,
    unitQuantity: 5,
    unitRateTarget: 10,
  };
  const sectionType: SectionTypeLikeForTotals = { defaultEstimateUnit: "EA" as EstimateUnit };
  const t = computeSectionTotals(room, sectionType);
  eq(t.qty, 5, "qty");
  eq(t.totalTarget, 50, "totalTarget");
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);

// Optional DB check
const runDb = process.argv.includes("--db");
if (runDb && failed === 0) {
  console.log("\nChecking database consistency...");
  import("../app/lib/prisma")
    .then(async ({ prisma }) => {
      const rooms = await prisma.room.findMany({
        include: { sectionType: { select: { defaultEstimateUnit: true } } },
        where: {
          OR: [
            { unitRateLow: { not: null } },
            { unitRateTarget: { not: null } },
            { unitRateHigh: { not: null } },
          ],
        },
      });
      let dbFailed = 0;
      for (const room of rooms) {
        const expected = computeSectionTotals(room, room.sectionType);
        const ok =
          (expected.totalLow === room.totalLow || (expected.totalLow == null && room.totalLow == null)) &&
          (expected.totalTarget === room.totalTarget || (expected.totalTarget == null && room.totalTarget == null)) &&
          (expected.totalHigh === room.totalHigh || (expected.totalHigh == null && room.totalHigh == null));
        if (!ok) {
          console.log(`  ✗ Room ${room.id} (${room.name}): expected totalLow=${expected.totalLow} totalTarget=${expected.totalTarget} totalHigh=${expected.totalHigh}, got ${room.totalLow}/${room.totalTarget}/${room.totalHigh}`);
          dbFailed++;
        }
      }
      if (dbFailed === 0) {
        console.log(`  All ${rooms.length} rooms with rates have consistent totals.`);
      } else {
        console.log(`  ${dbFailed} room(s) have inconsistent totals.`);
      }
      process.exit(dbFailed > 0 ? 1 : 0);
    })
    .catch((e) => {
      console.error("DB check failed:", e);
      process.exit(1);
    });
} else {
  process.exit(failed > 0 ? 1 : 0);
}
