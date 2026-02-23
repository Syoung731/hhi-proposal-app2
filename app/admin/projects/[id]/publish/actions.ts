"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { ProjectStatus } from "@/app/generated/prisma";
import type { SnapshotData } from "@/app/lib/snapshot";

export async function publishProjectAction(projectId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      rooms: { orderBy: { sortOrder: "asc" } },
      media: { orderBy: { sortOrder: "asc" } },
      timelinePhases: { orderBy: { sortOrder: "asc" } },
      investmentLineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!project) return { error: "Project not found" };
  const newVersion = project.publishedVersion + 1;
  const snapshot: SnapshotData = {
    version: newVersion,
    project: {
      title: project.title,
      subtitle: project.subtitle,
      address: project.address,
      clientNames: project.clientNames,
      coverHeroImageId: project.coverHeroImageId,
      objective: project.objective,
    },
    rooms: project.rooms.map((r) => ({
      id: r.id,
      roomType: r.roomType,
      roomLabel: r.roomLabel,
      scopeNarrative: r.scopeNarrative,
      sortOrder: r.sortOrder,
    })),
    media: project.media.map((m) => ({
      id: m.id,
      roomId: m.roomId,
      kind: m.kind,
      url: m.url,
      caption: m.caption,
      tags: m.tags,
      sortOrder: m.sortOrder,
    })),
    timelinePhases: project.timelinePhases.map((p) => ({
      id: p.id,
      phase: p.phase,
      durationText: p.durationText,
      sortOrder: p.sortOrder,
    })),
    investmentLineItems: project.investmentLineItems.map((i) => ({
      id: i.id,
      label: i.label,
      rangeLow: i.rangeLow,
      rangeHigh: i.rangeHigh,
      notes: i.notes,
      sortOrder: i.sortOrder,
    })),
  };
  await prisma.$transaction([
    prisma.publishedSnapshot.create({
      data: {
        projectId: project.id,
        version: newVersion,
        snapshotJson: snapshot as unknown as object,
      },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { publishedVersion: newVersion, status: ProjectStatus.PUBLISHED },
    }),
  ]);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/p/${project.slug}`);
  revalidatePath(`/p/${project.slug}/pdf`);
  return {};
}
