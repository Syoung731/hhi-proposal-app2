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
      scopeNarrative: `The Cost of Project Execution (COPE) represents all direct and necessary expenses incurred to facilitate the seamless and professional execution of your project. This comprehensive category includes the following key elements:

Permits and Fees — COPE accounts for all required permits and fees associated with the project, including but not limited to: Municipal and Regulatory Permits (building permits, inspections, and compliance fees) and HOA Fees (Homeowners' Association costs related to the project, such as vendor access passes, delivery fees, dumpster permits, and any non-refundable deposits mandated by the HOA).

Waste Removal and Sanitation — Proper site management is essential for maintaining safety and cleanliness throughout the project. COPE includes: Dumpsters (rental and removal fees for debris management), Sanitary Facilities (costs for providing and maintaining portable toilets for on-site workers), and Temporary Structures (when required, the setup and teardown of enclosures to protect sanitation facilities or waste areas from weather and other factors).

Final Construction Cleaning — Upon project completion, COPE ensures the space is professionally cleaned and ready for use. This includes the removal of construction dust, debris, and any materials related to the project.

On-Site Supervision — To maintain project oversight, COPE includes on-site supervision to ensure proper workflow, adherence to timelines, and quality standards. This service guarantees a smooth execution of all project phases.

Content Manipulation — If necessary, COPE covers the costs associated with moving and protecting your furniture and belongings. This includes relocating items within the property to allow for construction work and returning them to their original locations after project completion.

Floor and Content Protection — A critical part of protecting your home during the construction process, COPE includes: Floor Protection (materials such as Ram Board or other durable coverings to safeguard flooring from potential damage) and Content Wrapping (wrapping furniture, fixtures, and other valuable items in plastic or other protective materials to prevent dust or debris exposure).

By including these essential services in the Cost of Project Execution, HHI Builders ensures a comprehensive approach to site management, cleanliness, and protection of your property throughout the project. This meticulous planning reflects our commitment to delivering exceptional results with minimal disruption to your home.`,
      scopeSource: "TEMPLATE",
    },
  });

  console.log("Created COPE room for project", projectId);
  return copeRoom;
}
