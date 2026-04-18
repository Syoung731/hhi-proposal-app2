"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import {
  TIMELINE_PHASE_DEFINITIONS,
  getTimelinePhaseDefinition,
} from "@/app/lib/timeline-phases";

/**
 * Ensures every project has a TimelinePhase row for each canonical phase,
 * including the 2 milestones. Existing rows are re-synced to the canonical
 * sort order; missing rows are created with the canonical default duration.
 * Override fields are never touched here.
 */
export async function ensureTimelinePhasesAction(projectId: string): Promise<void> {
  await requireAdmin();
  const existing = await prisma.timelinePhase.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  });
  const existingByPhase = new Map(existing.map((p) => [p.phase, p]));

  for (let i = 0; i < TIMELINE_PHASE_DEFINITIONS.length; i++) {
    const def = TIMELINE_PHASE_DEFINITIONS[i]!;
    const row = existingByPhase.get(def.phase);
    if (!row) {
      await prisma.timelinePhase.create({
        data: {
          projectId,
          phase: def.phase,
          sortOrder: i,
          durationText: def.hasDuration ? (def.defaultDuration ?? "") : "",
        },
      });
    } else if (row.sortOrder !== i) {
      await prisma.timelinePhase.update({
        where: { id: row.id },
        data: { sortOrder: i },
      });
    }
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
}

type PhaseField = "name" | "description" | "duration";

/**
 * Update a single override field on a TimelinePhase record. Passing an empty
 * (or whitespace-only) string for `name` / `description` clears the override
 * so the phase falls back to the canonical default. For `duration`, an empty
 * string clears the duration text; UI can then surface the canonical default
 * as placeholder.
 */
export async function updateTimelinePhaseFieldAction(
  projectId: string,
  phaseId: string,
  field: PhaseField,
  value: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const phase = await prisma.timelinePhase.findFirst({
    where: { id: phaseId, projectId },
  });
  if (!phase) return { error: "Phase not found" };

  const trimmed = value.trim();

  if (field === "duration") {
    const def = getTimelinePhaseDefinition(phase.phase);
    if (def && !def.hasDuration) {
      return { error: "Milestone phases do not carry a duration" };
    }
    await prisma.timelinePhase.update({
      where: { id: phaseId },
      data: { durationText: trimmed },
    });
  } else if (field === "name") {
    await prisma.timelinePhase.update({
      where: { id: phaseId },
      data: { nameOverride: trimmed.length > 0 ? trimmed : null },
    });
  } else if (field === "description") {
    await prisma.timelinePhase.update({
      where: { id: phaseId },
      data: { descriptionOverride: trimmed.length > 0 ? trimmed : null },
    });
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Reset one override field back to the canonical default. For `duration`,
 * replaces the stored text with the canonical `defaultDuration`.
 */
export async function resetTimelinePhaseFieldAction(
  projectId: string,
  phaseId: string,
  field: PhaseField
): Promise<{ error?: string }> {
  await requireAdmin();
  const phase = await prisma.timelinePhase.findFirst({
    where: { id: phaseId, projectId },
  });
  if (!phase) return { error: "Phase not found" };

  const def = getTimelinePhaseDefinition(phase.phase);

  if (field === "duration") {
    if (!def?.hasDuration) {
      return { error: "Milestone phases do not carry a duration" };
    }
    await prisma.timelinePhase.update({
      where: { id: phaseId },
      data: { durationText: def.defaultDuration ?? "" },
    });
  } else if (field === "name") {
    await prisma.timelinePhase.update({
      where: { id: phaseId },
      data: { nameOverride: null },
    });
  } else if (field === "description") {
    await prisma.timelinePhase.update({
      where: { id: phaseId },
      data: { descriptionOverride: null },
    });
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Legacy single-duration update retained for callers that already imported it.
 * New code should use updateTimelinePhaseFieldAction(..., "duration", ...).
 */
export async function updateTimelinePhaseAction(
  projectId: string,
  phaseId: string,
  durationText: string
): Promise<{ error?: string }> {
  return updateTimelinePhaseFieldAction(projectId, phaseId, "duration", durationText);
}
