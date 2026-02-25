"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { deleteR2Objects, isStorageConfigured } from "@/app/lib/s3";
import { ProjectStatus } from "@/app/generated/prisma";

export async function archiveProjectAction(projectId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  await prisma.project.update({
    where: { id: projectId },
    data: { status: ProjectStatus.ARCHIVED },
  });
  revalidatePath("/admin/projects");
  return {};
}

export async function unarchiveProjectAction(projectId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  await prisma.project.update({
    where: { id: projectId },
    data: { status: ProjectStatus.DRAFT },
  });
  revalidatePath("/admin/projects");
  return {};
}

/**
 * Hard delete: remove all project media from R2, then delete project (cascade removes rooms, media, etc).
 * All-or-nothing: if R2 delete fails, we do not delete the DB record.
 */
export async function deleteProjectAction(projectId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { media: { select: { fileKey: true } } },
  });
  if (!project) return { error: "Project not found" };

  const fileKeys = project.media.map((m) => m.fileKey).filter(Boolean);
  if (fileKeys.length > 0) {
    if (!isStorageConfigured()) {
      return {
        error:
          "Storage (R2) is not configured. Cannot delete project with uploaded media. Configure R2 or remove media first.",
      };
    }
    try {
      await deleteR2Objects(fileKeys, { projectId });
    } catch (e) {
      const message = e instanceof Error ? e.message : "R2 delete failed";
      console.error(`deleteProjectAction R2 failure projectId=${projectId}`, e);
      return { error: message };
    }
  }

  await prisma.project.delete({ where: { id: projectId } });
  revalidatePath("/admin/projects");
  return {};
}
