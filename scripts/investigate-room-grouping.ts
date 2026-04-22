import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Phase 8A.1 — Section 4 validator.
 *
 * Pulls every Room in the DB and applies the proposed auto-grouping ruleset
 * to each. Reports distribution, ambiguities, and fall-through rooms.
 */

type Group =
  | "Primary Suite"
  | "Kitchen & Dining"
  | "Living Spaces"
  | "Bedrooms"
  | "Bathrooms"
  | "Carolina Room"
  | "Utility Rooms"
  | "Outdoor"
  | "COPE"
  | "Ungrouped";

type Room = {
  id: string;
  name: string;
  projectId: string;
  isProjectOverhead: boolean;
  bucket: string;
  roomTypeName: string | null;
  sortOrder: number;
};

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Classify a single room. Returns primary group + secondary group label
 * ("Bedroom 2", "Primary Bath", etc. for the individualized subgroups).
 * Also returns ALL matching groups for ambiguity detection.
 */
function classify(
  room: Room,
  allRooms: Room[]
): { group: Group; subgroup: string | null; allMatches: Group[] } {
  const name = normalize(room.name);
  const matches: Group[] = [];

  // 1. COPE first — exact match or isProjectOverhead flag.
  if (room.isProjectOverhead || /^cost of project execution$/i.test(name) || /\bcope\b/.test(name)) {
    matches.push("COPE");
    return { group: "COPE", subgroup: null, allMatches: matches };
  }

  // 2. Primary Suite — contains "primary" or "master"
  const isPrimary = /\b(primary|master)\b/.test(name);
  if (isPrimary) matches.push("Primary Suite");

  // 3. Kitchen & Dining
  const isKitchenDining =
    /\b(kitchen|pantry|breakfast|dining|wet bar)\b/.test(name);
  if (isKitchenDining) matches.push("Kitchen & Dining");

  // 4. Living Spaces
  const isLiving = /\b(living|family|great room|entry|foyer)\b/.test(name);
  if (isLiving) matches.push("Living Spaces");

  // 5. Bedroom — individualized. Only for non-primary bedrooms.
  // A room matches the bedroom group if:
  //   - Its name contains "bedroom" (but not primary), OR
  //   - It's a closet whose name contains a parent bedroom name as substring
  const containsBedroom = /\bbedroom\b/.test(name);
  const isClosetOfBedroom = (() => {
    if (!/\bcloset\b/.test(name)) return null;
    // Find a sibling room in the same project whose name (normalized) is a
    // substring of this closet's name and which is itself a bedroom
    for (const sibling of allRooms) {
      if (sibling.id === room.id) continue;
      if (sibling.projectId !== room.projectId) continue;
      const sib = normalize(sibling.name);
      if (!/\bbedroom\b/.test(sib)) continue;
      if (/\b(primary|master)\b/.test(sib)) continue;
      // substring match (case-insensitive, whole-word-ish)
      if (name.includes(sib)) return sib;
    }
    return null;
  })();
  if ((containsBedroom || isClosetOfBedroom) && !isPrimary) {
    matches.push("Bedrooms");
  }

  // 6. Bathrooms — individualized. Non-primary bath + powder + jack & jill.
  const isBath =
    /\b(bath|bathroom|powder|jack and jill|jack & jill|jack-and-jill)\b/.test(
      name
    );
  if (isBath && !isPrimary) matches.push("Bathrooms");

  // 7. Carolina Room — standalone
  const isCarolina = /\bcarolina\b/.test(name);
  if (isCarolina) matches.push("Carolina Room");

  // 8. Utility Rooms — laundry + mudroom
  const isUtility = /\b(laundry|mud\s?room|utility)\b/.test(name);
  if (isUtility) matches.push("Utility Rooms");

  // 9. Outdoor
  const isOutdoor = /\b(exterior|outdoor|patio|porch|deck|lanai|yard|pool|garage)\b/.test(
    name
  );
  if (isOutdoor) matches.push("Outdoor");

  // Resolve to primary group by priority order.
  if (matches.length === 0) {
    return { group: "Ungrouped", subgroup: null, allMatches: [] };
  }

  // Priority: COPE > Primary > Kitchen > Living > Carolina > Utility > Outdoor > Bedrooms > Bathrooms > Ungrouped
  // (Carolina/Utility/Outdoor before Bedrooms because a room named "Outdoor Bedroom"
  //  is more outdoor than bedroom; unlikely but safer.)
  const priority: Group[] = [
    "COPE",
    "Primary Suite",
    "Kitchen & Dining",
    "Living Spaces",
    "Carolina Room",
    "Utility Rooms",
    "Outdoor",
    "Bedrooms",
    "Bathrooms",
    "Ungrouped",
  ];
  let chosen: Group = "Ungrouped";
  for (const g of priority) {
    if (matches.includes(g)) {
      chosen = g;
      break;
    }
  }

  // Subgroup label for individualized groups
  let subgroup: string | null = null;
  if (chosen === "Bedrooms") {
    // Use the parent bedroom name if closet; otherwise use the room's own name
    if (isClosetOfBedroom) {
      subgroup = isClosetOfBedroom;
    } else {
      subgroup = name;
    }
  } else if (chosen === "Bathrooms") {
    subgroup = name;
  } else if (chosen === "Carolina Room") {
    subgroup = name;
  }

  return { group: chosen, subgroup, allMatches: matches };
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const rooms = await prisma.room.findMany({
    select: {
      id: true,
      name: true,
      projectId: true,
      isProjectOverhead: true,
      bucket: true,
      sortOrder: true,
      roomType: { select: { name: true } },
    },
  });

  const normalized: Room[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    projectId: r.projectId,
    isProjectOverhead: r.isProjectOverhead,
    bucket: String(r.bucket),
    roomTypeName: r.roomType?.name ?? null,
    sortOrder: r.sortOrder,
  }));

  console.log(`Total rooms scanned: ${normalized.length}`);
  console.log(`Distinct projects: ${new Set(normalized.map((r) => r.projectId)).size}`);

  // Distinct RoomType names
  const distinctRoomTypes = Array.from(
    new Set(normalized.map((r) => r.roomTypeName).filter(Boolean))
  ).sort() as string[];
  console.log(`\nDistinct RoomType names (${distinctRoomTypes.length}):`);
  for (const rt of distinctRoomTypes) console.log(`  ${rt}`);

  // Distinct Room.name values
  const distinctRoomNames = Array.from(new Set(normalized.map((r) => r.name))).sort();
  console.log(`\nDistinct Room.name values (${distinctRoomNames.length}):`);
  for (const n of distinctRoomNames) console.log(`  ${n}`);

  // Classify every room
  const groupCounts = new Map<Group, number>();
  const ambiguities: { name: string; matches: Group[] }[] = [];
  const groupMembers = new Map<Group, Set<string>>();

  for (const r of normalized) {
    const { group, allMatches } = classify(r, normalized);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    if (!groupMembers.has(group)) groupMembers.set(group, new Set());
    groupMembers.get(group)!.add(r.name);
    if (allMatches.length > 1) {
      ambiguities.push({ name: r.name, matches: allMatches });
    }
  }

  console.log(`\n═══ Group distribution (across all ${normalized.length} rooms) ═══`);
  const priority: Group[] = [
    "Primary Suite",
    "Kitchen & Dining",
    "Living Spaces",
    "Bedrooms",
    "Bathrooms",
    "Carolina Room",
    "Utility Rooms",
    "Outdoor",
    "Ungrouped",
    "COPE",
  ];
  for (const g of priority) {
    const c = groupCounts.get(g) ?? 0;
    console.log(`  ${g}: ${c} rooms (${((c / normalized.length) * 100).toFixed(1)}%)`);
  }

  console.log("\n═══ Distinct names per group ═══");
  for (const g of priority) {
    const names = groupMembers.get(g);
    if (!names || names.size === 0) continue;
    console.log(`\n[${g}]  ${names.size} distinct names`);
    for (const n of Array.from(names).sort()) {
      console.log(`  ${n}`);
    }
  }

  console.log(`\n═══ Ambiguous matches (room names that triggered >1 group) ═══`);
  if (ambiguities.length === 0) {
    console.log("  None. No room matched multiple groups.");
  } else {
    const dedup = new Map<string, Group[]>();
    for (const a of ambiguities) {
      if (!dedup.has(a.name)) dedup.set(a.name, a.matches);
    }
    for (const [name, matches] of dedup) {
      console.log(`  ${name}  →  matched: ${matches.join(", ")}`);
    }
  }

  // Spot-check: for each project, show how its rooms would render in order
  console.log(`\n═══ Sample render order (first 3 projects) ═══`);
  const projectIds = Array.from(new Set(normalized.map((r) => r.projectId)));
  for (const pid of projectIds.slice(0, 3)) {
    const projRooms = normalized.filter((r) => r.projectId === pid);
    console.log(`\nProject ${pid} — ${projRooms.length} rooms`);
    const classified = projRooms.map((r) => ({ room: r, ...classify(r, normalized) }));
    for (const g of priority) {
      const members = classified.filter((c) => c.group === g);
      if (members.length === 0) continue;
      console.log(`  [${g}]`);
      for (const m of members) {
        console.log(`    ${m.room.name}  (bucket=${m.room.bucket})`);
      }
    }
  }

  // Flag any totalLow null cases that might affect sync
  const nullTotalCount = await prisma.room.count({
    where: { totalLow: null, isProjectOverhead: false },
  });
  const totalRoomCount = await prisma.room.count({
    where: { isProjectOverhead: false },
  });
  console.log(`\n═══ Null Room.totalLow (non-COPE) ═══`);
  console.log(`  ${nullTotalCount} of ${totalRoomCount} non-COPE rooms have totalLow = null`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
