"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function updateProjectOverviewAction(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const title = (formData.get("title") as string)?.trim();
  const subtitle = (formData.get("subtitle") as string)?.trim() || null;
  const addressLine1 = (formData.get("addressLine1") as string)?.trim() || null;
  const addressLine2 = (formData.get("addressLine2") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const state = (formData.get("state") as string)?.trim() || null;
  const zip = (formData.get("zip") as string)?.trim() || null;
  const client1First = (formData.get("client1First") as string)?.trim() || null;
  const client1Last = (formData.get("client1Last") as string)?.trim() || null;
  const client2First = (formData.get("client2First") as string)?.trim() || null;
  const client2Last = (formData.get("client2Last") as string)?.trim() || null;
  const transcriptText = (formData.get("transcriptText") as string)?.trim() || null;
  const objective = (formData.get("objective") as string)?.trim() || null;
  // Only update coverHeroImageId when form sends it (Media tab sets hero; Overview does not).
  const coverHeroImageId = formData.has("coverHeroImageId")
    ? ((formData.get("coverHeroImageId") as string)?.trim() || null)
    : undefined;
  if (!title) return { error: "Title is required" };
  await prisma.project.update({
    where: { id: projectId },
    data: {
      title,
      subtitle,
      addressLine1,
      addressLine2,
      city,
      state,
      zip,
      client1First,
      client1Last,
      client2First,
      client2Last,
      transcriptText,
      objective,
      ...(coverHeroImageId !== undefined && { coverHeroImageId }),
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function updateProjectStylePresetAction(
  projectId: string,
  stylePresetId: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  if (stylePresetId) {
    const preset = await prisma.stylePreset.findUnique({ where: { id: stylePresetId } });
    if (!preset?.isActive) return { error: "Style preset not found or inactive" };
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { stylePresetId },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function updateProjectTranscriptAction(
  projectId: string,
  transcriptText: string
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const trimmed = transcriptText?.trim() ?? "";
  if (!trimmed) {
    return { ok: true };
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  await prisma.project.update({
    where: { id: projectId },
    data: { transcriptText: trimmed },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true };
}
