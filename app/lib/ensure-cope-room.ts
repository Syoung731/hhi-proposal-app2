import { prisma } from "@/app/lib/prisma";

export async function ensureCopeRoom(projectId: string) {
  // Check if COPE room already exists
  const existing = await prisma.room.findFirst({
    where: { projectId, isProjectOverhead: true },
  });
  if (existing) return existing;

  // Find the COPE template
  const copeTemplate = await prisma.roomTemplate.findFirst({
    where: { isProjectOverhead: true, active: true },
  });

  if (!copeTemplate) {
    console.warn("No active COPE template found. Skipping COPE room creation.");
    return null;
  }

  // Bump all existing rooms' sortOrder by 1 so COPE is first
  await prisma.room.updateMany({
    where: { projectId },
    data: { sortOrder: { increment: 1 } },
  });

  // Create the COPE room
  const copeRoom = await prisma.room.create({
    data: {
      project: { connect: { id: projectId } },
      name: "Cost of Project Execution",
      isProjectOverhead: true,
      roomTemplate: { connect: { id: copeTemplate.id } },
      pricingTier: "AI_ESTIMATE",
      bucket: "BASE",
      origin: "TEMPLATE",
      sortOrder: 0,
      scopeNarrative:
        "Project-level overhead: permits & fees, waste removal, final construction clean, on-site supervision, floor & content protection. Auto-generated from aggregate project data.",
      scopeSource: "TEMPLATE",
    },
  });

  console.log("Created COPE room for project", projectId);
  return copeRoom;
}
