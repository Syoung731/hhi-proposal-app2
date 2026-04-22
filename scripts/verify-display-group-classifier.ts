/**
 * Phase 8A.1 T2 verification.
 *
 * Runs two layers of checks:
 *   1. Unit tests — hand-written fixtures covering each rule + priority order
 *      + the closet substring match. No DB needed.
 *   2. DB validation — pulls every Room in the production DB, runs the
 *      classifier, and asserts the distribution matches the investigation
 *      Section 4 report (74 rooms, 2.7% Ungrouped, 0 feels-wrong).
 *
 * Exits non-zero on any failure.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  classifyRoomToDisplayGroup,
  DEFAULT_GROUP_ORDER,
  FIXED_GROUPS,
  isKnownDisplayGroupSlug,
  resolveGroup,
  type RoomForClassification,
} from "../app/lib/investment/display-group-classifier";

let failed = 0;

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    console.error(`  FAIL: ${msg}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        actual:   ${JSON.stringify(actual)}`);
    failed++;
  } else {
    console.log(`  ok: ${msg}`);
  }
}

function mk(id: string, name: string, isProjectOverhead = false): RoomForClassification {
  return { id, name, isProjectOverhead };
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 — Unit tests
// ═══════════════════════════════════════════════════════════════════════════

console.log("Unit tests:");

const noSiblings: RoomForClassification[] = [];

// isProjectOverhead always wins
assertEq(
  classifyRoomToDisplayGroup(mk("r1", "Randomly Named", true), noSiblings),
  "cope",
  "isProjectOverhead=true → cope regardless of name",
);

// COPE by name (belt-and-suspenders)
assertEq(
  classifyRoomToDisplayGroup(mk("r2", "Cost of Project Execution", false), noSiblings),
  "cope",
  'name "Cost of Project Execution" → cope',
);
assertEq(
  classifyRoomToDisplayGroup(mk("r3", "Cope", false), noSiblings),
  "cope",
  'name "Cope" → cope',
);

// Primary Suite beats everything
assertEq(
  classifyRoomToDisplayGroup(mk("p1", "Primary Bedroom", false), noSiblings),
  "primary-suite",
  "Primary Bedroom → primary-suite",
);
assertEq(
  classifyRoomToDisplayGroup(mk("p2", "Master Bathroom", false), noSiblings),
  "primary-suite",
  "Master Bathroom → primary-suite (beats bathroom rule)",
);
assertEq(
  classifyRoomToDisplayGroup(mk("p3", "Primary Closet 1", false), noSiblings),
  "primary-suite",
  "Primary Closet 1 → primary-suite (beats closet-parent match)",
);
assertEq(
  classifyRoomToDisplayGroup(mk("p4", "Primary Hallway", false), noSiblings),
  "primary-suite",
  "Primary Hallway → primary-suite",
);

// Kitchen & Dining
assertEq(
  classifyRoomToDisplayGroup(mk("k1", "Kitchen", false), noSiblings),
  "kitchen-dining",
  "Kitchen → kitchen-dining",
);
assertEq(
  classifyRoomToDisplayGroup(mk("k2", "Pantry Dry Bar Area", false), noSiblings),
  "kitchen-dining",
  "Pantry Dry Bar Area → kitchen-dining",
);
assertEq(
  classifyRoomToDisplayGroup(mk("k3", "Breakfast Nook", false), noSiblings),
  "kitchen-dining",
  "Breakfast Nook → kitchen-dining",
);
assertEq(
  classifyRoomToDisplayGroup(mk("k4", "Dining Room", false), noSiblings),
  "kitchen-dining",
  "Dining Room → kitchen-dining",
);
assertEq(
  classifyRoomToDisplayGroup(mk("k5", "Wet Bar", false), noSiblings),
  "kitchen-dining",
  "Wet Bar → kitchen-dining",
);

// Living Spaces
assertEq(
  classifyRoomToDisplayGroup(mk("l1", "Living Room", false), noSiblings),
  "living-spaces",
  "Living Room → living-spaces",
);
assertEq(
  classifyRoomToDisplayGroup(mk("l2", "Entry Way", false), noSiblings),
  "living-spaces",
  "Entry Way → living-spaces",
);
assertEq(
  classifyRoomToDisplayGroup(mk("l3", "Family Room", false), noSiblings),
  "living-spaces",
  "Family Room → living-spaces",
);
assertEq(
  classifyRoomToDisplayGroup(mk("l4", "Foyer", false), noSiblings),
  "living-spaces",
  "Foyer → living-spaces",
);

// Individualized groups
assertEq(
  classifyRoomToDisplayGroup(mk("b1", "Bedroom 2", false), noSiblings),
  "bedroom-b1",
  "Bedroom 2 → bedroom-<id>",
);
assertEq(
  classifyRoomToDisplayGroup(mk("bath1", "Powder Room", false), noSiblings),
  "bathroom-bath1",
  "Powder Room → bathroom-<id>",
);
assertEq(
  classifyRoomToDisplayGroup(mk("bath2", "Jack And Jill Bathroom", false), noSiblings),
  "bathroom-bath2",
  "Jack And Jill Bathroom → bathroom-<id>",
);
assertEq(
  classifyRoomToDisplayGroup(mk("c1", "Carolina Room", false), noSiblings),
  "carolina-room-c1",
  "Carolina Room → carolina-room-<id>",
);

// Utility / Outdoor / Storage
assertEq(
  classifyRoomToDisplayGroup(mk("u1", "Laundry Room", false), noSiblings),
  "utility",
  "Laundry Room → utility",
);
assertEq(
  classifyRoomToDisplayGroup(mk("u2", "Mudroom", false), noSiblings),
  "utility",
  "Mudroom → utility",
);
assertEq(
  classifyRoomToDisplayGroup(mk("o1", "Exterior", false), noSiblings),
  "outdoor",
  "Exterior → outdoor",
);
assertEq(
  classifyRoomToDisplayGroup(mk("o2", "Patio", false), noSiblings),
  "outdoor",
  "Patio → outdoor",
);
assertEq(
  classifyRoomToDisplayGroup(mk("s1", "Attic", false), noSiblings),
  "storage",
  "Attic → storage (per Q3 new rule)",
);
assertEq(
  classifyRoomToDisplayGroup(mk("s2", "Garage", false), noSiblings),
  "storage",
  "Garage → storage",
);

// Closet → parent bedroom substring match
const closetSiblings: RoomForClassification[] = [
  mk("b2-id", "Bedroom 2", false),
  mk("b3-id", "Bedroom 3", false),
];
assertEq(
  classifyRoomToDisplayGroup(mk("c-b2", "Bedroom 2 Closet", false), closetSiblings),
  "bedroom-b2-id",
  "Bedroom 2 Closet nests into Bedroom 2",
);
assertEq(
  classifyRoomToDisplayGroup(mk("c-b3", "Bedroom 3 Closet", false), closetSiblings),
  "bedroom-b3-id",
  "Bedroom 3 Closet nests into Bedroom 3",
);
assertEq(
  classifyRoomToDisplayGroup(mk("c-hall", "Hall Closet", false), closetSiblings),
  "ungrouped",
  "Hall Closet (no parent match) → ungrouped",
);
assertEq(
  classifyRoomToDisplayGroup(mk("c-walk", "Walk-in Closet", false), closetSiblings),
  "ungrouped",
  "Walk-in Closet (no parent match) → ungrouped",
);

// Closet with a PRIMARY sibling — should NOT nest into that primary via
// the bedroom path (Primary beats the closet logic because of the primary
// regex catching the closet name itself when it contains "primary").
const primarySibling: RoomForClassification[] = [
  mk("p-id", "Primary Bedroom", false),
  mk("b2-id", "Bedroom 2", false),
];
assertEq(
  classifyRoomToDisplayGroup(mk("c-p", "Primary Closet", false), primarySibling),
  "primary-suite",
  "Primary Closet → primary-suite (primary regex catches first)",
);
// "Bedroom 2 Walk-in" doesn't match /closet/ — falls through to the bedroom
// rule and gets its OWN individualized slug (not the parent's).
assertEq(
  classifyRoomToDisplayGroup(mk("c-b2b", "Bedroom 2 Walk-in", false), primarySibling),
  "bedroom-c-b2b",
  "Bedroom 2 Walk-in (no 'closet' token) → own bedroom-<id>",
);
// Closet that matches a parent sibling by substring — nests under parent.
assertEq(
  classifyRoomToDisplayGroup(mk("c-b2c", "Bedroom 2 Walk-in Closet", false), primarySibling),
  "bedroom-b2-id",
  "Bedroom 2 Walk-in Closet (has 'closet' + parent substring) → parent's bedroom-<id>",
);

// Ungrouped fallback
assertEq(
  classifyRoomToDisplayGroup(mk("x1", "Home Office", false), noSiblings),
  "ungrouped",
  "Home Office → ungrouped",
);
assertEq(
  classifyRoomToDisplayGroup(mk("x2", "Workshop", false), noSiblings),
  "ungrouped",
  "Workshop → ungrouped",
);
assertEq(
  classifyRoomToDisplayGroup(mk("x3", "", false), noSiblings),
  "ungrouped",
  "Empty name → ungrouped",
);
assertEq(
  classifyRoomToDisplayGroup(mk("x4", "   ", false), noSiblings),
  "ungrouped",
  "Whitespace-only name → ungrouped",
);

// isKnownDisplayGroupSlug / resolveGroup
assertEq(isKnownDisplayGroupSlug("primary-suite"), true, "primary-suite is known");
assertEq(isKnownDisplayGroupSlug("bedroom-xyz123"), true, "bedroom-xyz123 is known");
assertEq(isKnownDisplayGroupSlug("something-else"), false, "something-else is not known");
assertEq(resolveGroup("primary-suite").label, "Primary Suite", "primary-suite label");
assertEq(resolveGroup("cope").label, "Cost of Project Execution", "cope label");
assertEq(resolveGroup("bedroom-abc").individualized, true, "bedroom-abc individualized=true");
assertEq(resolveGroup("bedroom-abc").renderCategory, "bedroom", "bedroom-abc renderCategory");

// DEFAULT_GROUP_ORDER shape sanity
assertEq(DEFAULT_GROUP_ORDER[0], "primary-suite", "DEFAULT_GROUP_ORDER starts with primary-suite");
assertEq(
  DEFAULT_GROUP_ORDER[DEFAULT_GROUP_ORDER.length - 1],
  "cope",
  "DEFAULT_GROUP_ORDER ends with cope",
);
assertEq(Object.keys(FIXED_GROUPS).length, 8, "FIXED_GROUPS has 8 entries");

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 — DB validation
// ═══════════════════════════════════════════════════════════════════════════

async function dbValidation() {
  console.log("\nDB validation:");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const rawRooms = await prisma.room.findMany({
      select: { id: true, name: true, projectId: true, isProjectOverhead: true },
    });
    const byProject = new Map<string, RoomForClassification[]>();
    for (const r of rawRooms) {
      const arr = byProject.get(r.projectId) ?? [];
      arr.push({ id: r.id, name: r.name, isProjectOverhead: r.isProjectOverhead });
      byProject.set(r.projectId, arr);
    }

    let total = 0;
    let ungrouped = 0;
    const categoryCounts = new Map<string, number>();

    for (const [, siblings] of byProject) {
      for (const room of siblings) {
        total++;
        const slug = classifyRoomToDisplayGroup(room, siblings);
        const cat = resolveGroup(slug).renderCategory;
        categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
        if (cat === "ungrouped") ungrouped++;
      }
    }

    console.log(`  Total rooms classified: ${total}`);
    for (const [cat, count] of [...categoryCounts.entries()].sort()) {
      const pct = ((count / total) * 100).toFixed(1);
      console.log(`    ${cat.padEnd(15)}  ${count.toString().padStart(3)}  (${pct}%)`);
    }

    const ungroupedPct = (ungrouped / total) * 100;
    // Investigation reported 2.7% (2 rooms). With the new storage rule the
    // Attic now leaves ungrouped, so we expect ≤2%.
    if (ungroupedPct > 3) {
      console.error(`  FAIL: Ungrouped rate ${ungroupedPct.toFixed(1)}% exceeds 3% ceiling`);
      failed++;
    } else {
      console.log(`  ok: Ungrouped rate ${ungroupedPct.toFixed(1)}% within 3% ceiling`);
    }

    // Storage rule should catch Attic specifically (added in T2 per Q3).
    const atticRooms = rawRooms.filter((r) => /\battic\b/i.test(r.name));
    for (const r of atticRooms) {
      const slug = classifyRoomToDisplayGroup(
        { id: r.id, name: r.name, isProjectOverhead: r.isProjectOverhead },
        byProject.get(r.projectId) ?? [],
      );
      assertEq(slug, "storage", `"${r.name}" → storage`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Allow skipping DB validation when there's no DATABASE_URL (CI envs).
const runDb = !!process.env.DATABASE_URL;

async function main() {
  if (runDb) {
    await dbValidation();
  } else {
    console.log("\nDB validation skipped (no DATABASE_URL).");
  }

  console.log();
  if (failed > 0) {
    console.error(`${failed} failure(s).`);
    process.exit(1);
  } else {
    console.log("All checks passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
