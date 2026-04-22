import "server-only";
import { prisma as defaultPrisma } from "@/app/lib/prisma";
import {
  classifyRoomToDisplayGroup,
  type RoomForClassification,
} from "./display-group-classifier";

type PrismaLike = typeof defaultPrisma;

/**
 * Assigns displayGroupId + displayGroupOrder to a freshly-created Room.
 *
 * Two writes (create then update) is acceptable — Room creation is not a hot
 * path. The alternative (pre-generating a cuid client-side) would require
 * synchronizing id generation across the create call sites.
 *
 * Order is `(max existing displayGroupOrder in that group) + 1` so new rooms
 * append to the end of their group.
 */
export async function assignDisplayGroupForRoom(
  roomId: string,
  prisma: PrismaLike = defaultPrisma
): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, projectId: true, name: true, isProjectOverhead: true },
  });
  if (!room) return;

  // Siblings excluding self — used by the closet→parent-bedroom name match.
  const siblings: RoomForClassification[] = await prisma.room.findMany({
    where: { projectId: room.projectId, NOT: { id: roomId } },
    select: { id: true, name: true, isProjectOverhead: true },
  });

  const slug = classifyRoomToDisplayGroup(room, siblings);

  const maxAgg = await prisma.room.aggregate({
    where: { projectId: room.projectId, displayGroupId: slug, NOT: { id: roomId } },
    _max: { displayGroupOrder: true },
  });
  const nextOrder = (maxAgg._max.displayGroupOrder ?? -1) + 1;

  await prisma.room.update({
    where: { id: roomId },
    data: { displayGroupId: slug, displayGroupOrder: nextOrder },
  });
}

/**
 * Batch variant — classify each room in sequence so later rooms see the
 * displayGroupOrder writes from earlier rooms in the same batch.
 */
export async function assignDisplayGroupsForRooms(
  roomIds: readonly string[],
  prisma: PrismaLike = defaultPrisma
): Promise<void> {
  for (const id of roomIds) {
    await assignDisplayGroupForRoom(id, prisma);
  }
}
