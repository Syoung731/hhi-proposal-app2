import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

// Re-use the same classify logic as the generic script but restrict to
// the Oyster Reef project (23 rooms) for a focused render-order check.

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
  totalLow: number | null;
  totalHigh: number | null;
};

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function classify(room: Room, allRooms: Room[]): { group: Group; matches: Group[] } {
  const name = normalize(room.name);
  const matches: Group[] = [];

  if (room.isProjectOverhead || /^cost of project execution$/i.test(name) || /\bcope\b/.test(name)) {
    return { group: "COPE", matches: ["COPE"] };
  }

  const isPrimary = /\b(primary|master)\b/.test(name);
  if (isPrimary) matches.push("Primary Suite");

  if (/\b(kitchen|pantry|breakfast|dining|wet bar)\b/.test(name)) matches.push("Kitchen & Dining");
  if (/\b(living|family|great room|entry|foyer)\b/.test(name)) matches.push("Living Spaces");

  const containsBedroom = /\bbedroom\b/.test(name);
  const isClosetOfBedroom = (() => {
    if (!/\bcloset\b/.test(name)) return null;
    for (const sibling of allRooms) {
      if (sibling.id === room.id || sibling.projectId !== room.projectId) continue;
      const sib = normalize(sibling.name);
      if (!/\bbedroom\b/.test(sib) || /\b(primary|master)\b/.test(sib)) continue;
      if (name.includes(sib)) return sib;
    }
    return null;
  })();
  if ((containsBedroom || isClosetOfBedroom) && !isPrimary) matches.push("Bedrooms");

  if (/\b(bath|bathroom|powder|jack and jill|jack & jill|jack-and-jill)\b/.test(name) && !isPrimary) {
    matches.push("Bathrooms");
  }

  if (/\bcarolina\b/.test(name)) matches.push("Carolina Room");
  if (/\b(laundry|mud\s?room|utility)\b/.test(name)) matches.push("Utility Rooms");
  if (/\b(exterior|outdoor|patio|porch|deck|lanai|yard|pool|garage)\b/.test(name)) matches.push("Outdoor");

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
  ];
  for (const g of priority) if (matches.includes(g)) return { group: g, matches };
  return { group: "Ungrouped", matches: [] };
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const projects = await prisma.project.findMany({
    select: {
      id: true,
      title: true,
      rooms: {
        select: {
          id: true,
          name: true,
          projectId: true,
          isProjectOverhead: true,
          bucket: true,
          totalLow: true,
          totalHigh: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  const priorityRender: Group[] = [
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

  for (const p of projects) {
    if (p.rooms.length < 5) continue; // skip tiny projects
    console.log(`\n══════ ${p.title} (${p.rooms.length} rooms) ══════`);
    const classified = p.rooms.map((r) => ({ room: r, ...classify(r, p.rooms) }));

    for (const g of priorityRender) {
      const members = classified.filter((c) => c.group === g);
      if (members.length === 0) continue;
      console.log(`\n  [${g}]`);
      for (const m of members) {
        const pricing = m.room.totalLow != null
          ? `$${Math.round(m.room.totalLow).toLocaleString()}-$${Math.round(m.room.totalHigh ?? 0).toLocaleString()}`
          : "(no pricing)";
        console.log(`    ${m.room.name}  bucket=${m.room.bucket}  ${pricing}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
