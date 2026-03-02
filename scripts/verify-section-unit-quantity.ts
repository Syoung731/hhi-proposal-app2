/**
 * Verification script for deterministic unitQuantity computation.
 * Run: npx tsx scripts/verify-section-unit-quantity.ts
 *
 * Rules verified:
 * - effectiveMode = measurementMode ?? sectionType.defaultMeasurementMode ?? NONE
 * - DIMENSIONS: length = lengthFt + (lengthIn/12), width = same; unitQuantity = round(length*width, 2) when both present
 * - AREA: unitQuantity = round(areaSqFt, 2)
 * - COUNT: unitQuantity = quantity (float)
 * - NONE: unitQuantity = null
 * - Height is never used for area
 */

import {
  computeUnitQuantity,
  getEffectiveMeasurementMode,
  type RoomLikeForUnitQuantity,
} from "../app/lib/section-unit-quantity";

type MeasurementMode = "NONE" | "DIMENSIONS" | "AREA" | "COUNT";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function eq<T>(a: T, b: T, msg: string) {
  const ok = a === b || (Number.isNaN(a as number) && Number.isNaN(b as number)) || (a != null && b != null && Math.abs((a as number) - (b as number)) < 1e-9);
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

console.log("Section unitQuantity computation — verification\n");

// effectiveMode
test("effectiveMode: room.measurementMode wins over sectionType default", () => {
  const mode = getEffectiveMeasurementMode(
    { measurementMode: "AREA" },
    "DIMENSIONS"
  );
  eq(mode, "AREA", "effectiveMode");
});

test("effectiveMode: sectionType default when room.measurementMode is null", () => {
  const mode = getEffectiveMeasurementMode(
    { measurementMode: null },
    "COUNT"
  );
  eq(mode, "COUNT", "effectiveMode");
});

test("effectiveMode: NONE when both null/undefined", () => {
  const mode = getEffectiveMeasurementMode({}, null);
  eq(mode, "NONE", "effectiveMode");
});

// DIMENSIONS
test("DIMENSIONS: length and width from ft+in, unitQuantity = round(L*W, 2)", () => {
  const room: RoomLikeForUnitQuantity = {
    measurementMode: "DIMENSIONS",
    lengthFt: 10,
    lengthIn: 6,
    widthFt: 12,
    widthIn: 0,
  };
  const q = computeUnitQuantity(room, null);
  // length = 10 + 6/12 = 10.5, width = 12 + 0 = 12, area = 126
  eq(q, 126, "DIMENSIONS 10'6\" x 12'");
});

test("DIMENSIONS: only inches (lengthFt/widthFt 0)", () => {
  const room: RoomLikeForUnitQuantity = {
    measurementMode: "DIMENSIONS",
    lengthIn: 150,
    widthIn: 120,
  };
  const q = computeUnitQuantity(room, null);
  // 150/12 = 12.5, 120/12 = 10, area = 125
  eq(q, 125, "DIMENSIONS inches only");
});

test("DIMENSIONS: missing one dimension => null", () => {
  const room: RoomLikeForUnitQuantity = {
    measurementMode: "DIMENSIONS",
    lengthIn: 120,
  };
  const q = computeUnitQuantity(room, null);
  eq(q, null, "DIMENSIONS missing width");
});

test("DIMENSIONS: zero dimension => null", () => {
  const room: RoomLikeForUnitQuantity = {
    measurementMode: "DIMENSIONS",
    lengthIn: 0,
    widthIn: 120,
  };
  const q = computeUnitQuantity(room, null);
  eq(q, null, "DIMENSIONS zero length");
});

// AREA
test("AREA: unitQuantity = round(areaSqFt, 2)", () => {
  const q = computeUnitQuantity(
    { measurementMode: "AREA", areaSqFt: 123.456 },
    null
  );
  eq(q, 123.46, "AREA rounded");
});

test("AREA: null areaSqFt => null", () => {
  const q = computeUnitQuantity({ measurementMode: "AREA" }, null);
  eq(q, null, "AREA null");
});

// COUNT
test("COUNT: unitQuantity = quantity as float", () => {
  const q = computeUnitQuantity(
    { measurementMode: "COUNT", quantity: 5 },
    null
  );
  eq(q, 5, "COUNT");
});

// NONE
test("NONE: unitQuantity = null", () => {
  const q = computeUnitQuantity({ measurementMode: "NONE" }, null);
  eq(q, null, "NONE");
});

test("effectiveMode NONE from sectionType default when no room mode", () => {
  const q = computeUnitQuantity(
    { lengthIn: 120, widthIn: 120 },
    "NONE"
  );
  eq(q, null, "default NONE => no computation");
});

test("effectiveMode DIMENSIONS from sectionType default", () => {
  const q = computeUnitQuantity(
    { lengthIn: 144, widthIn: 144 },
    "DIMENSIONS"
  );
  // 12*12 = 144 sq ft
  eq(q, 144, "default DIMENSIONS");
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
