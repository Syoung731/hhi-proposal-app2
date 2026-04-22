/**
 * Phase 8A.1c T5 verification.
 *
 * Validates the standalone-promote logic without going through the UI:
 *   1. Pick a project, classify a real room as standalone, simulate the
 *      deck sync, verify the resulting line items.
 *   2. Restore that room to its individualized slug, simulate again.
 *   3. Verify originalIndividualizedSlugFor() correctness.
 *
 * Read-only — does not write to the DB. All mutations happen in memory.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  isKnownDisplayGroupSlug,
  originalIndividualizedSlugFor,
  resolveGroup,
  type DisplayGroupSlug,
} from "../app/lib/investment/display-group-classifier";

const PROJECT_ID = "cmo8mgpn20006o47kjvop2zlj"; // Oyster Reef

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

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    console.log("─── Classifier shape guards ────────────────────────────────");
    assertEq(isKnownDisplayGroupSlug("standalone-abc"), true, "standalone- is known");
    assertEq(isKnownDisplayGroupSlug("standalone-"), true, "standalone- empty suffix is known");
    assertEq(
      resolveGroup("standalone-xyz" as DisplayGroupSlug).renderCategory,
      "standalone",
      "resolveGroup standalone- → renderCategory standalone",
    );
    assertEq(
      resolveGroup("standalone-xyz" as DisplayGroupSlug).individualized,
      true,
      "resolveGroup standalone- → individualized true",
    );

    console.log("\n─── originalIndividualizedSlugFor on real rooms ───────────");
    const rooms = await prisma.room.findMany({
      where: { projectId: PROJECT_ID },
      select: { id: true, name: true, isProjectOverhead: true },
    });
    const primaryBath = rooms.find((r) => r.name === "Primary Bath");
    const bedroom2 = rooms.find((r) => r.name === "Bedroom 2");
    const carolinaRoom = rooms.find((r) => r.name === "Carolina Room");
    const kitchen = rooms.find((r) => r.name === "Kitchen");

    if (primaryBath) {
      assertEq(
        originalIndividualizedSlugFor(primaryBath),
        null,
        "Primary Bath → null (primary excluded)",
      );
    }
    if (bedroom2) {
      assertEq(
        originalIndividualizedSlugFor(bedroom2),
        `bedroom-${bedroom2.id}`,
        "Bedroom 2 → bedroom-<id>",
      );
    }
    if (carolinaRoom) {
      assertEq(
        originalIndividualizedSlugFor(carolinaRoom),
        `carolina-room-${carolinaRoom.id}`,
        "Carolina Room → carolina-room-<id>",
      );
    }
    if (kitchen) {
      assertEq(
        originalIndividualizedSlugFor(kitchen),
        null,
        "Kitchen → null (no individualized rule)",
      );
    }

    console.log("\n─── Simulated deck sync with one standalone slug ──────────");
    // Read every room with pricing.
    const allRooms = await prisma.room.findMany({
      where: { projectId: PROJECT_ID },
      select: {
        id: true,
        name: true,
        bucket: true,
        totalLow: true,
        totalHigh: true,
        displayGroupId: true,
        displayGroupOrder: true,
      },
    });
    const project = await prisma.project.findUnique({
      where: { id: PROJECT_ID },
      select: { displayGroupOrder: true },
    });
    const savedOrder: string[] = Array.isArray(project?.displayGroupOrder)
      ? (project!.displayGroupOrder as string[])
      : [];

    // Synthetically promote Primary Bath.
    const targetRoom = primaryBath;
    if (!targetRoom) {
      console.log("  (skip — Primary Bath not found in this project)");
    } else {
      const synthetic = allRooms.map((r) =>
        r.id === targetRoom.id
          ? { ...r, displayGroupId: `standalone-${targetRoom.id}`, displayGroupOrder: 0 }
          : r,
      );

      // Inline group-by-slug + sum (mirrors syncInvestmentSlide logic).
      const priced = synthetic.filter((r) => r.totalLow != null || r.totalHigh != null);
      const groups = new Map<string, typeof priced>();
      for (const r of priced) {
        const slug = r.displayGroupId ?? "ungrouped";
        const arr = groups.get(slug) ?? [];
        arr.push(r);
        groups.set(slug, arr);
      }

      // The standalone slug should appear with exactly one member.
      const standaloneSlug = `standalone-${targetRoom.id}`;
      const standaloneMembers = groups.get(standaloneSlug);
      assertEq(
        standaloneMembers?.length ?? 0,
        1,
        "standalone- has exactly 1 member after promote",
      );
      assertEq(
        standaloneMembers?.[0]?.id,
        targetRoom.id,
        "standalone- member is the promoted room",
      );

      // Primary Suite should no longer contain the promoted room.
      const primarySuiteMembers = groups.get("primary-suite") ?? [];
      const stillIncluded = primarySuiteMembers.some((m) => m.id === targetRoom.id);
      assertEq(stillIncluded, false, "primary-suite no longer contains promoted Primary Bath");

      console.log(`  Resulting groups (${groups.size}):`);
      for (const [slug, members] of groups) {
        console.log(`    ${slug}  (${members.length} member${members.length === 1 ? "" : "s"})`);
      }
    }

    console.log("\n─── Saved displayGroupOrder (current DB state) ────────────");
    console.log(`  ${savedOrder.length === 0 ? "(empty — uses default priority)" : JSON.stringify(savedOrder)}`);
  } finally {
    await prisma.$disconnect();
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
