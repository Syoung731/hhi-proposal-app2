"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { TimelinePhaseType } from "@/app/generated/prisma";

const PHASES: TimelinePhaseType[] = [
  TimelinePhaseType.DESIGN_FEASIBILITY,
  TimelinePhaseType.PRECONSTRUCTION,
  TimelinePhaseType.CONSTRUCTION,
];

export async function ensureTimelinePhasesAction(projectId: string): Promise<void> {
  await requireAdmin();
  const existing = await prisma.timelinePhase.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  });
  const existingByPhase = new Map(existing.map((p) => [p.phase, p]));
  for (let i = 0; i < PHASES.length; i++) {
    const phase = PHASES[i]!;
    if (!existingByPhase.has(phase)) {
      await prisma.timelinePhase.create({
        data: { projectId, phase, sortOrder: i, durationText: "" },
      });
    }
  }
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
}

export async function updateTimelinePhaseAction(
  projectId: string,
  phaseId: string,
  durationText: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const phase = await prisma.timelinePhase.findFirst({
    where: { id: phaseId, projectId },
  });
  if (!phase) return { error: "Phase not found" };
  await prisma.timelinePhase.update({
    where: { id: phaseId },
    data: { durationText: durationText.trim() },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}
