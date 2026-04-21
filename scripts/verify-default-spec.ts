import { buildDefaultDeckSpec } from "../app/lib/deck/default-spec";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  ok: ${msg}`);
}

console.log("Test 1: project with 0 rooms, hasAddition=false");
const spec1 = buildDefaultDeckSpec({ rooms: [] });
console.log(`  slides: ${spec1.map((s) => s.type).join(", ")}`);
assert(spec1.map((s) => s.type).includes("cover"), "has cover");
assert(!spec1.map((s) => s.type).includes("scope-breakdown"), "no scope-breakdown (0 rooms)");
assert(!spec1.map((s) => s.type).includes("addition-overview"), "no addition-overview (hasAddition=false)");
assert(!spec1.map((s) => s.type).includes("risk-brief"), "no risk-brief (reclassified)");
assert(!spec1.map((s) => s.type).includes("process"), "no process (reclassified)");
assert(!spec1.map((s) => s.type).includes("core-values"), "no core-values (reclassified)");
assert(!spec1.map((s) => s.type).includes("design-build-advantage"), "no design-build-advantage (reclassified)");
assert(!spec1.map((s) => s.type).includes("client-testimonials"), "no client-testimonials (reclassified)");

console.log("\nTest 2: project with 3 rooms, hasAddition=true");
const spec2 = buildDefaultDeckSpec({ rooms: [{ id: "a" }, { id: "b" }, { id: "c" }], hasAddition: true });
console.log(`  slides: ${spec2.map((s) => s.type).join(", ")}`);
assert(spec2.map((s) => s.type).includes("scope-breakdown"), "has scope-breakdown (3 rooms)");
assert(spec2.map((s) => s.type).includes("addition-overview"), "has addition-overview (hasAddition=true)");
assert(spec2.map((s) => s.type).includes("before-after"), "has before-after slot reserved");
assert(spec2.map((s) => s.type).includes("visual-inspiration"), "has visual-inspiration");

console.log("\nTest 3: order sequence is monotonically increasing");
const orders = spec2.map((s) => s.order);
for (let i = 1; i < orders.length; i++) {
  assert(orders[i] > orders[i - 1], `order[${i}]=${orders[i]} > order[${i - 1}]=${orders[i - 1]}`);
}

console.log("\nTest 4: locks are correct");
const cover = spec2.find((s) => s.type === "cover");
assert(cover?.isLocked === true && cover.lockPosition === "first", "cover is locked first");
const closing = spec2.find((s) => s.type === "closing-slide");
assert(closing?.isLocked === true && closing.lockPosition === "last", "closing-slide is locked last");

console.log("\nTest 5: order values");
const byType = new Map(spec2.map((s) => [s.type, s.order]));
assert(byType.get("cover") === 100, "cover at 100");
assert(byType.get("objective") === 200, "objective at 200");
assert(byType.get("scope-overview") === 300, "scope-overview at 300");
assert(byType.get("scope-breakdown") === 400, "scope-breakdown at 400");
assert(byType.get("before-after") === 500, "before-after at 500");
assert(byType.get("cope-page") === 600, "cope-page at 600");
assert(byType.get("visual-inspiration") === 700, "visual-inspiration at 700");
assert(byType.get("why-us") === 800, "why-us at 800");
assert(byType.get("project-timeline") === 900, "project-timeline at 900");
assert(byType.get("investment") === 1000, "investment at 1000");
assert(byType.get("design-retainer") === 1100, "design-retainer at 1100");
assert(byType.get("next-steps") === 1200, "next-steps at 1200");
assert(byType.get("addition-overview") === 1300, "addition-overview at 1300");
assert(byType.get("closing-slide") === 1400, "closing-slide at 1400");

console.log("\nAll tests passed.");
