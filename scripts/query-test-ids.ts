import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const projects = await prisma.project.findMany({
    take: 3,
    select: { id: true, title: true },
  });
  console.log("PROJECTS:");
  for (const p of projects) {
    console.log(`  ${p.id}  |  ${p.title}`);
  }

  if (projects.length > 0) {
    const pid = projects[0].id;
    const rooms = await prisma.room.findMany({
      where: { projectId: pid },
      take: 5,
      select: { id: true, roomTypeId: true, sortOrder: true },
    });
    console.log(`\nROOMS for "${projects[0].title}":`);
    for (const r of rooms) {
      console.log(`  ${r.id}  |  roomTypeId: ${r.roomTypeId}  |  sortOrder: ${r.sortOrder}`);
    }
  }

  const templates = await prisma.roomTemplate.findMany({
    where: { active: true },
    select: { id: true, displayName: true },
  });
  console.log("\nROOM TEMPLATES:");
  for (const t of templates) {
    console.log(`  ${t.id}  |  ${t.displayName}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
