"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getPresignedUploadUrl } from "@/app/lib/s3";
import { MediaKind } from "@/app/generated/prisma";

export async function getPresignedUploadUrlAction(
  projectId: string,
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; fileKey: string; publicUrl: string } | { error: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const ext = filename.split(".").pop() ?? "bin";
  const fileKey = `projects/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  try {
    return await getPresignedUploadUrl(fileKey, contentType);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate upload URL";
    return { error: message };
  }
}

export async function createMediaAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const projectId = formData.get("projectId") as string;
  const fileKey = formData.get("fileKey") as string;
  const url = formData.get("url") as string;
  const kind = (formData.get("kind") as MediaKind) ?? MediaKind.OTHER;
  const caption = (formData.get("caption") as string)?.trim() || null;
  const tagsStr = (formData.get("tags") as string)?.trim();
  const tags = tagsStr ? tagsStr.split(/[\s,]+/).filter(Boolean) : [];
  const roomId = (formData.get("roomId") as string) || null;
  if (!projectId || !fileKey || !url) {
    return { error: "Missing projectId, fileKey, or url" };
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const maxOrder = await prisma.media
    .aggregate({
      where: { projectId },
      _max: { sortOrder: true },
    })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.media.create({
    data: {
      projectId,
      roomId: roomId || undefined,
      kind,
      url,
      fileKey,
      caption,
      tags,
      sortOrder: maxOrder + 1,
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function updateMediaAction(
  projectId: string,
  mediaId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const caption = (formData.get("caption") as string)?.trim() || null;
  const tagsStr = (formData.get("tags") as string)?.trim();
  const tags = tagsStr ? tagsStr.split(/[\s,]+/).filter(Boolean) : [];
  const kind = formData.get("kind") as MediaKind | null;
  const roomId = (formData.get("roomId") as string) || null;
  const media = await prisma.media.findFirst({
    where: { id: mediaId, projectId },
  });
  if (!media) return { error: "Media not found" };
  await prisma.media.update({
    where: { id: mediaId },
    data: {
      ...(caption !== undefined && { caption }),
      tags,
      ...(kind && { kind }),
      roomId: roomId === "" ? null : roomId,
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function deleteMediaAction(projectId: string, mediaId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const media = await prisma.media.findFirst({
    where: { id: mediaId, projectId },
  });
  if (!media) return { error: "Media not found" };
  await prisma.media.delete({ where: { id: mediaId } });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function moveMediaOrderAction(
  projectId: string,
  mediaId: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  await requireAdmin();
  const media = await prisma.media.findFirst({
    where: { id: mediaId, projectId },
  });
  if (!media) return { error: "Media not found" };
  const list = await prisma.media.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  const idx = list.findIndex((m) => m.id === mediaId);
  if (idx < 0) return { error: "Media not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return {};
  const other = list[swapIdx]!;
  await prisma.$transaction([
    prisma.media.update({ where: { id: mediaId }, data: { sortOrder: other.sortOrder } }),
    prisma.media.update({ where: { id: other.id }, data: { sortOrder: media.sortOrder } }),
  ]);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}
