"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { ProjectStatus } from "@/app/generated/prisma";
import type { SnapshotData } from "@/app/lib/snapshot";
import { serializeDeckForSnapshot } from "@/app/lib/snapshot-serializer";

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
  const effectiveInvestmentItems = project.investmentLineItems.map((i) => {
    const rangeLow = i.isOverride ? i.overrideLow : i.rangeLow;
    const rangeTarget = i.isOverride ? i.overrideTarget : i.rangeTarget;
    const rangeHigh = i.isOverride ? i.overrideHigh : i.rangeHigh;
    return {
      id: i.id,
      label: i.label,
      rangeLow,
      rangeTarget,
      rangeHigh,
      notes: i.notes,
      sortOrder: i.sortOrder,
      includeInTotals: i.includeInTotals,
    };
  });
  const newVersion = project.publishedVersion + 1;
  const deck = await serializeDeckForSnapshot(projectId);
  const snapshot: SnapshotData = {
    schema: deck ? "v2-deck" : "v1-legacy",
    version: newVersion,
    project: {
      title: project.title,
      subtitle: project.subtitle,
      addressLine1: project.addressLine1,
      addressLine2: project.addressLine2,
      city: project.city,
      state: project.state,
      zip: project.zip,
      client1First: project.client1First,
      client1Last: project.client1Last,
      client2First: project.client2First,
      client2Last: project.client2Last,
      coverHeroImageId: project.coverHeroImageId,
      objective: project.objective,
    },
    rooms: project.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      scopeNarrative: r.scopeNarrative,
      sortOrder: r.sortOrder,
    })),
    media: project.media.map((m) => ({
      id: m.id,
      roomId: m.roomId,
      kind: m.kind,
      type: m.type,
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
    investmentLineItems: effectiveInvestmentItems,
    ...(deck ? { deck } : {}),
  };
  const [createdSnapshot] = await prisma.$transaction([
    prisma.publishedSnapshot.create({
      data: {
        projectId: project.id,
        version: newVersion,
        snapshotJson: snapshot as unknown as object,
      },
      select: { id: true },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { publishedVersion: newVersion, status: ProjectStatus.PUBLISHED },
    }),
    prisma.proposal.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, isPublic: true },
      update: { isPublic: true },
      select: { id: true },
    }),
  ]);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/proposals/${createdSnapshot.id}`);
  revalidatePath(`/proposals/${createdSnapshot.id}/pdf`);
  return {};
}
