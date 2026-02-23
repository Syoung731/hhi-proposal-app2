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
  const address = (formData.get("address") as string)?.trim() || null;
  const clientNames = (formData.get("clientNames") as string)?.trim() || null;
  const objective = (formData.get("objective") as string)?.trim() || null;
  const coverHeroImageId = (formData.get("coverHeroImageId") as string)?.trim() || null;
  if (!title) return { error: "Title is required" };
  await prisma.project.update({
    where: { id: projectId },
    data: {
      title,
      subtitle,
      address,
      clientNames,
      objective,
      coverHeroImageId: coverHeroImageId || undefined,
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}
