import "server-only";
import { prisma } from "@/app/lib/prisma";

/**
 * Returns library media items by id for use in public Objective Template A (photoSlots).
 * Order matches the requested ids; missing ids get url "".
 */
export async function getLibraryMediaByIds(
  ids: string[]
): Promise<{ id: string; url: string }[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.libraryMedia.findMany({
    where: { id: { in: ids } },
    select: { id: true, url: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r.url]));
  return ids.map((id) => ({ id, url: byId.get(id) ?? "" }));
}

/**
 * Returns active brand icons by id for use in public Objective Template C (columns).
 * Used for resolving columns[].iconId to image URLs. Missing or inactive ids are omitted.
 */
export async function getBrandIconsByIds(
  ids: string[]
): Promise<{ id: string; imageUrl: string }[]> {
  if (ids.length === 0) return [];
  const uniqueIds = [...new Set(ids)];
  const rows = await prisma.brandIcon.findMany({
    where: { id: { in: uniqueIds }, isActive: true },
    select: { id: true, imageUrl: true },
  });
  return rows;
}
