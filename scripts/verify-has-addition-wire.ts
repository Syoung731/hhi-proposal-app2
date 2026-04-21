import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildDefaultDeckSpec } from "../app/lib/deck/default-spec";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // Pick a project, toggle hasAddition, verify the spec reflects it.
  const project = await prisma.project.findFirst({
    select: { id: true, title: true, hasAddition: true, rooms: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (!project) {
    console.log("No projects found.");
    return;
  }

  console.log(`Project: ${project.id}  title="${project.title}"  hasAddition=${project.hasAddition}  rooms=${project.rooms.length}`);

  // Spec with current value
  const spec1 = buildDefaultDeckSpec({
    rooms: project.rooms,
    hasAddition: project.hasAddition,
  });
  console.log(`\nCurrent spec includes addition-overview? ${spec1.some((s) => s.type === "addition-overview")}`);

  // What the spec would produce if we flipped hasAddition
  const spec2 = buildDefaultDeckSpec({
    rooms: project.rooms,
    hasAddition: !project.hasAddition,
  });
  console.log(`If hasAddition=${!project.hasAddition}, spec includes addition-overview? ${spec2.some((s) => s.type === "addition-overview")}`);

  console.log(`\nSpec size current: ${spec1.length}`);
  console.log(`Spec size flipped: ${spec2.length}`);
  console.log(`Difference: ${Math.abs(spec1.length - spec2.length)} (should be 1 — addition-overview)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
