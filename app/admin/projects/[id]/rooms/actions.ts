"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { RoomType } from "@/app/generated/prisma";

export async function createRoomAction(projectId: string, formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const roomType = (formData.get("roomType") as RoomType) ?? RoomType.OTHER;
  const roomLabel = (formData.get("roomLabel") as string)?.trim() || null;
  const scopeNarrative = (formData.get("scopeNarrative") as string)?.trim() ?? "";
  const maxOrder = await prisma.room
    .aggregate({ where: { projectId }, _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.room.create({
    data: {
      projectId,
      roomType,
      roomLabel,
      scopeNarrative,
      sortOrder: maxOrder + 1,
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function updateRoomAction(
  projectId: string,
  roomId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  const roomType = formData.get("roomType") as RoomType | null;
  const roomLabel = (formData.get("roomLabel") as string)?.trim() || null;
  const scopeNarrative = (formData.get("scopeNarrative") as string)?.trim() ?? "";
  await prisma.room.update({
    where: { id: roomId },
    data: {
      ...(roomType && { roomType }),
      roomLabel,
      scopeNarrative,
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function deleteRoomAction(projectId: string, roomId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  await prisma.room.delete({ where: { id: roomId } });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function moveRoomOrderAction(
  projectId: string,
  roomId: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({ where: { id: roomId, projectId } });
  if (!room) return { error: "Room not found" };
  const list = await prisma.room.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  const idx = list.findIndex((r) => r.id === roomId);
  if (idx < 0) return { error: "Room not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return {};
  const other = list[swapIdx]!;
  await prisma.$transaction([
    prisma.room.update({ where: { id: roomId }, data: { sortOrder: other.sortOrder } }),
    prisma.room.update({ where: { id: other.id }, data: { sortOrder: room.sortOrder } }),
  ]);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}
