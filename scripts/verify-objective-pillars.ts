import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const projectId = process.argv[2] ?? "cmo4bex83000y0s7k1xr2f7cz";
  const action = process.argv[3] ?? "set"; // "set" | "clear" | "read"

  if (action === "read") {
    const p = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, title: true, objective: true, objectivePillars: true },
    });
    console.log(JSON.stringify(p, null, 2));
  } else if (action === "clear") {
    await prisma.project.update({
      where: { id: projectId },
      data: { objectivePillars: null as unknown as undefined },
    });
    console.log(`Cleared objectivePillars on ${projectId}`);
  } else {
    // set
    const pillars = [
      { title: "The Space", body: "A fully conditioned addition extending family living without compromising the home's original proportions." },
      { title: "The Connection", body: "Seamless sightlines and traffic flow between existing home and new wing feel effortless." },
      { title: "The Protection", body: "New exterior envelope built to withstand coastal weather with a 50-year warranty." },
    ];
    await prisma.project.update({
      where: { id: projectId },
      data: {
        objective: "Turning an empty side yard into conditioned living space that feels like it was always part of the home.",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        objectivePillars: pillars as any,
      },
    });
    console.log(`Set test pillars + objective on ${projectId}`);
    console.log(JSON.stringify(pillars, null, 2));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
