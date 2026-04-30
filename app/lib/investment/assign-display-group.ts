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

/**
 * Normalize display-group state for a project:
 *
 *   - Any room that's truly "alone" (no displayGroupId, OR member of a
 *     group with fewer than 2 rooms) gets its slug set to a unique
 *     `standalone-{room.id}`. This guarantees that solo rooms always
 *     render as their own line item in the Investment tree (single-member
 *     branch in GroupRow) and on the deck Investment-by-Space slide
 *     (groupLabelFor's "standalone-" branch returns the room name).
 *
 *   - Rooms already in `standalone-{id}` slugs are left alone — they're
 *     the canonical "alone" state.
 *
 *   - COPE is exempt — always its own group regardless of member count.
 *
 *   - Real groups (slug shared by 2+ members) are untouched.
 *
 *   - Project.displayGroupNames + displayGroupOrder are pruned of any
 *     slugs that no longer have any members so the JSON maps don't grow.
 *
 * Idempotent — safe to call on every group mutation OR on every room
 * creation. Returns the count of rooms whose displayGroupId was changed.
 */
export async function dissolveSingleMemberGroups(
  projectId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<{ dissolvedRoomCount: number; prunedSlugs: string[] }> {
  const rooms = await prisma.room.findMany({
    where: { projectId },
    select: { id: true, displayGroupId: true, isProjectOverhead: true },
  });

  // Slugs that mean "no real group" — these rooms are converted to
  // standalone-{id} regardless of how many other rooms share the slug.
  // Treats null and the legacy literal "ungrouped" string the same way.
  const isLooseSlug = (slug: string | null): boolean =>
    !slug || slug === "ungrouped";

  // Group rooms by slug to find which slugs have <2 non-COPE members.
  const counts = new Map<string, string[]>();
  for (const r of rooms) {
    if (r.isProjectOverhead) continue; // COPE handled separately
    const slug = r.displayGroupId;
    if (isLooseSlug(slug)) continue; // loose slugs handled below
    counts.set(slug!, [...(counts.get(slug!) ?? []), r.id]);
  }

  // Determine which rooms need conversion to standalone:
  //   1. Rooms with null or "ungrouped" displayGroupId (and not COPE).
  //   2. Members of non-cope, non-standalone groups with <2 members.
  const toStandalone: string[] = [];
  for (const r of rooms) {
    if (r.isProjectOverhead) continue;
    if (isLooseSlug(r.displayGroupId)) {
      toStandalone.push(r.id);
      continue;
    }
    if (r.displayGroupId!.startsWith("standalone-")) continue; // already canonical
    const groupSize = counts.get(r.displayGroupId!)?.length ?? 0;
    if (groupSize < 2) {
      toStandalone.push(r.id);
    }
  }

  if (toStandalone.length > 0) {
    // Each room gets its own unique slug — must update one at a time since
    // updateMany can't set per-row distinct values.
    await prisma.$transaction(
      toStandalone.map((id) =>
        prisma.room.update({
          where: { id },
          data: { displayGroupId: `standalone-${id}`, displayGroupOrder: 0 },
        }),
      ),
    );
  }

  // Compute which slugs have ≥2 members AFTER the conversion (real groups).
  // Standalone-* slugs are also "live" because each is bound to one room.
  const liveSlugs = new Set<string>();
  for (const [slug, ids] of counts) {
    if (ids.length >= 2) liveSlugs.add(slug);
  }
  for (const id of toStandalone) {
    liveSlugs.add(`standalone-${id}`);
  }
  // Existing standalones are still live too.
  for (const r of rooms) {
    if (r.displayGroupId?.startsWith("standalone-")) {
      liveSlugs.add(r.displayGroupId);
    }
  }

  // Prune custom labels and group order entries for slugs no longer in use.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { displayGroupNames: true, displayGroupOrder: true },
  });
  const prunedSlugs: string[] = [];
  if (project) {
    const labels = (project.displayGroupNames as Record<string, string>) ?? {};
    const nextLabels: Record<string, string> = {};
    for (const [slug, label] of Object.entries(labels)) {
      if (liveSlugs.has(slug)) {
        nextLabels[slug] = label;
      } else {
        prunedSlugs.push(slug);
      }
    }
    const order = Array.isArray(project.displayGroupOrder)
      ? (project.displayGroupOrder as string[]).filter((s) => liveSlugs.has(s) || s === "cope")
      : [];
    if (
      prunedSlugs.length > 0 ||
      order.length !== (Array.isArray(project.displayGroupOrder) ? (project.displayGroupOrder as string[]).length : 0)
    ) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          displayGroupNames: nextLabels,
          displayGroupOrder: order,
        },
      });
    }
  }

  return { dissolvedRoomCount: toStandalone.length, prunedSlugs };
}
