"use server";

import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";

export async function linkRendrProject(
  appProjectId: string,
  rendrProjectId: number,
  rendrSpaceId: number,
) {
  await requireAdmin();
  await prisma.project.update({
    where: { id: appProjectId },
    data: {
      rendrProjectId,
      rendrSpaceId,
      rendrLinkedAt: new Date(),
      rendrImportedAt: null,
    },
  });
  revalidatePath(`/admin/projects/${appProjectId}`);
}

export async function unlinkRendrProject(appProjectId: string) {
  await requireAdmin();
  await prisma.project.update({
    where: { id: appProjectId },
    data: {
      rendrProjectId: null,
      rendrSpaceId: null,
      rendrLinkedAt: null,
      rendrImportedAt: null,
    },
  });
  revalidatePath(`/admin/projects/${appProjectId}`);
}

export async function importRendrMeasurements(
  appProjectId: string,
  mappings: { rendrRoomIndex: number; appRoomId: string; floorSF: number }[],
) {
  await requireAdmin();

  // Fetch full takeoff data server-side
  const project = await prisma.project.findUnique({
    where: { id: appProjectId },
    select: { rendrSpaceId: true },
  });
  if (!project?.rendrSpaceId) throw new Error("No Rendr scan linked.");

  // Get imperial takeoff data from API route
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/rendr/spaces/${project.rendrSpaceId}/takeoff`,
  );
  if (!res.ok) throw new Error("Failed to fetch takeoff data");
  const takeoff = await res.json();

  // Update each mapped room
  for (const mapping of mappings) {
    const room = takeoff.rooms[mapping.rendrRoomIndex];
    if (!room) continue;
    const t = room.takeoff;

    await prisma.room.update({
      where: { id: mapping.appRoomId },
      data: {
        areaSqFt: t.floorSF,
        measurementMode: "AREA",
        // Store LiDAR metadata as JSON in scopeQA (extend existing JSON field)
        pricingNotes: [
          `LiDAR Import: Floor ${t.floorSF} SF, Walls ${t.wallsSF} SF, Ceiling ${t.ceilingSF} SF`,
          `Perimeter ${t.perimeterLF} LF, Paintable ${t.paintableSF} SF`,
          t.numberOfWindows ? `Windows: ${t.numberOfWindows} (${t.windowsSF} SF)` : null,
          t.numberOfDoors ? `Doors: ${t.numberOfDoors} (${t.doorsSF} SF)` : null,
          t.numberOfSinks ? `Sinks: ${t.numberOfSinks}` : null,
          t.numberOfToilets ? `Toilets: ${t.numberOfToilets}` : null,
          t.numberOfBathtubs ? `Bathtubs: ${t.numberOfBathtubs}` : null,
          t.baseCabinetsLF ? `Base Cabinets: ${t.numberOfBaseCabinets} (${t.baseCabinetsLF} LF)` : null,
          t.wallCabinetsLF ? `Wall Cabinets: ${t.numberOfWallCabinets} (${t.wallCabinetsLF} LF)` : null,
          t.countertopsLF ? `Countertops: ${t.countertopsLF} LF (${t.countertopsSF} SF)` : null,
          t.backsplashLF ? `Backsplash: ${t.backsplashLF} LF (${t.backsplashSF} SF)` : null,
          t.numberOfFirePlaces ? `Fireplaces: ${t.numberOfFirePlaces}` : null,
        ].filter(Boolean).join("\n"),
      },
    });
  }

  // Mark import complete
  await prisma.project.update({
    where: { id: appProjectId },
    data: { rendrImportedAt: new Date() },
  });

  revalidatePath(`/admin/projects/${appProjectId}`);
  return { importedCount: mappings.length };
}
