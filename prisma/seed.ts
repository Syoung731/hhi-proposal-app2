import "dotenv/config";
import {
  PrismaClient,
  MediaKind,
  ProjectStatus,
  RoomType,
  TimelinePhaseType,
} from "../app/generated/prisma/index.js";

const prisma = new PrismaClient();

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function main() {
  const slug = "sample-remodel";
  await prisma.project.upsert({
    where: { slug },
    create: {
      slug,
      status: ProjectStatus.DRAFT,
      title: "Sample Home Remodel",
      subtitle: "Kitchen & Bath Proposal",
      address: "123 Main St, Anytown",
      clientNames: "Jane & John Smith",
      objective:
        "Transform the kitchen and primary bath into modern, functional spaces that match your style and improve daily living.",
      publishedVersion: 0,
      rooms: {
        create: [
          {
            roomType: RoomType.KITCHEN,
            roomLabel: null,
            scopeNarrative:
              "Full cabinet refresh, new countertops, and island with seating. New appliances and lighting. Flooring refinish to match existing hardwood.",
            sortOrder: 0,
          },
          {
            roomType: RoomType.BATHROOM,
            roomLabel: "Primary Bath",
            scopeNarrative:
              "Walk-in shower with tile surround, double vanity, and heated floor. New fixtures and mirror.",
            sortOrder: 1,
          },
        ],
      },
      timelinePhases: {
        create: [
          { phase: TimelinePhaseType.DESIGN_FEASIBILITY, durationText: "2–3 weeks", sortOrder: 0 },
          { phase: TimelinePhaseType.PRECONSTRUCTION, durationText: "2–4 weeks", sortOrder: 1 },
          { phase: TimelinePhaseType.CONSTRUCTION, durationText: "6–8 weeks", sortOrder: 2 },
        ],
      },
      investmentLineItems: {
        create: [
          { label: "Kitchen", rangeLow: 45000, rangeHigh: 65000, sortOrder: 0 },
          { label: "Primary Bath", rangeLow: 28000, rangeHigh: 38000, sortOrder: 1 },
          { label: "Contingency & permits", rangeLow: 5000, rangeHigh: 8000, notes: "~10%", sortOrder: 2 },
        ],
      },
    },
    update: {},
  });

  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) throw new Error("Project not created");

  const existingMedia = await prisma.media.count({ where: { projectId: project.id } });
  if (existingMedia === 0) {
    await prisma.media.create({
      data: {
        projectId: project.id,
        roomId: null,
        kind: MediaKind.COVER,
        url: "https://placehold.co/1200x800/f5f5f5/999?text=Cover+Image",
        fileKey: "seed/cover-placeholder",
        caption: "Hero image",
        tags: ["cover"],
        sortOrder: 0,
      },
    });
  }

  console.log("Seed complete. Sample project slug:", slug);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
