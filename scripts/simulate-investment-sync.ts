/**
 * Phase 8A.1 T6 dry-run simulation.
 *
 * Replicates the core logic of the new syncInvestmentSlide against a given
 * project. Does NOT write anything — just prints the lineItems[] the sync
 * would produce.
 *
 * Useful while the dev server has a stale Prisma client and can't hit the
 * real sync via /admin/projects/<id>/deck.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const PROJECT_ID = process.argv[2] ?? "cmo8mgpn20006o47kjvop2zlj";

function defaultSlugPriority(slug: string): number {
  if (slug === "primary-suite") return 0;
  if (slug === "kitchen-dining") return 1;
  if (slug === "living-spaces") return 2;
  if (slug.startsWith("bedroom-")) return 3;
  if (slug.startsWith("bathroom-")) return 4;
  if (slug.startsWith("carolina-room-")) return 5;
  if (slug === "utility") return 6;
  if (slug === "outdoor") return 7;
  if (slug === "storage") return 8;
  if (slug === "ungrouped") return 9;
  if (slug === "cope") return 99;
  return 9;
}

function groupLabelFor(slug: string, members: { name: string }[]): string {
  if (slug.startsWith("bedroom-") || slug.startsWith("bathroom-") || slug.startsWith("carolina-room-")) {
    return members[0]?.name ?? "(Unnamed)";
  }
  switch (slug) {
    case "primary-suite": return "Primary Suite";
    case "kitchen-dining": return "Kitchen & Dining";
    case "living-spaces": return "Living Spaces";
    case "utility": return "Utility Rooms";
    case "outdoor": return "Outdoor";
    case "storage": return "Storage";
    case "ungrouped": return members[0]?.name ?? "Additional";
    case "cope": return "Cost of Project Execution";
    default: return members[0]?.name ?? slug;
  }
}

function buildIncludesText(members: { name: string }[]): string | null {
  if (members.length <= 1) return null;
  const names = members.map((m) => m.name);
  if (names.length <= 3) return `Includes: ${names.join(", ")}`;
  return `Includes: ${names.slice(0, 3).join(", ")}, … and ${names.length - 3} more`;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const rooms = await prisma.room.findMany({
      where: { projectId: PROJECT_ID },
      select: {
        id: true,
        name: true,
        bucket: true,
        totalLow: true,
        totalTarget: true,
        totalHigh: true,
        displayGroupId: true,
        displayGroupOrder: true,
      },
    });
    const project = await prisma.project.findUnique({
      where: { id: PROJECT_ID },
      select: { title: true, displayGroupOrder: true },
    });

    const savedOrder = Array.isArray(project?.displayGroupOrder)
      ? (project!.displayGroupOrder as string[])
      : [];

    console.log(`Project: ${project?.title}  rooms=${rooms.length}  saved order=[${savedOrder.join(", ")}]\n`);

    const priced = rooms.filter((r) => r.totalLow != null || r.totalHigh != null);
    const groups = new Map<string, typeof priced>();
    for (const r of priced) {
      const slug = r.displayGroupId ?? "ungrouped";
      const arr = groups.get(slug) ?? [];
      arr.push(r);
      groups.set(slug, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => a.displayGroupOrder - b.displayGroupOrder || a.name.localeCompare(b.name));
    }

    const userIndex = new Map(savedOrder.map((s, i) => [s, i]));
    const slugs = Array.from(groups.keys()).sort((a, b) => {
      if (a === "cope" && b !== "cope") return 1;
      if (b === "cope" && a !== "cope") return -1;
      const aU = userIndex.get(a);
      const bU = userIndex.get(b);
      if (aU !== undefined && bU !== undefined) return aU - bU;
      if (aU !== undefined) return -1;
      if (bU !== undefined) return 1;
      const ap = defaultSlugPriority(a);
      const bp = defaultSlugPriority(b);
      return ap === bp ? a.localeCompare(b) : ap - bp;
    });

    console.log("Projected lineItems[]:");
    let lineItemCount = 0;
    for (const slug of slugs) {
      const members = groups.get(slug)!;
      let lo = 0, hi = 0;
      for (const m of members) {
        lo += m.totalLow ?? 0;
        hi += m.totalHigh ?? 0;
      }
      if (lo === 0 && hi === 0) continue;
      const label = groupLabelFor(slug, members);
      const includes = buildIncludesText(members);
      const bucket = String(members[0].bucket ?? "BASE");
      console.log(`  [${bucket}]  ${label}  $${Math.round(lo).toLocaleString()} – $${Math.round(hi).toLocaleString()}`);
      if (includes) console.log(`       ${includes}`);
      lineItemCount++;
    }
    console.log(`\nTotal lineItems emitted: ${lineItemCount}`);

    // Hidden (null pricing) rooms — flag them for context.
    const hidden = rooms.filter((r) => r.totalLow == null && r.totalHigh == null);
    if (hidden.length > 0) {
      console.log(`\nHidden (null pricing) rooms: ${hidden.length}`);
      for (const h of hidden) console.log(`  ${h.name}  (displayGroupId=${h.displayGroupId})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
