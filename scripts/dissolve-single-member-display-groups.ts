/**
 * One-shot migration: convert all "alone" rooms to canonical
 * `standalone-{roomId}` slugs across every project. A room is "alone" if
 * it has no displayGroupId, or it shares a slug with fewer than 2 rooms
 * (excluding COPE). Rooms already in standalone-* slugs are untouched.
 *
 * Why this exists: prior to the user-driven grouping refactor the app
 * auto-classified every room into a fixed slug at creation time, which
 * created surprise single-member groups (lone Primary Closet → "Primary
 * Suite"). Then a partial earlier fix cleared those slugs to null, which
 * caused all null-slug rooms to bucket together as one "Ungrouped" line
 * on the deck. The canonical answer is: every solo room owns a unique
 * standalone slug.
 *
 * Logic mirrors dissolveSingleMemberGroups in
 * app/lib/investment/assign-display-group.ts but is duplicated here
 * because that module imports "server-only" which can't load from a
 * standalone script.
 *
 * Idempotent — re-running on already-clean data does nothing.
 *
 * Usage:
 *   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/dissolve-single-member-display-groups.ts
 */

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function dissolveSingleMemberGroups(projectId: string) {
  const rooms = await prisma.room.findMany({
    where: { projectId },
    select: { id: true, displayGroupId: true, isProjectOverhead: true },
  });

  const isLooseSlug = (slug: string | null): boolean =>
    !slug || slug === "ungrouped";

  const counts = new Map<string, string[]>();
  for (const r of rooms) {
    if (r.isProjectOverhead) continue;
    const slug = r.displayGroupId;
    if (isLooseSlug(slug)) continue;
    counts.set(slug!, [...(counts.get(slug!) ?? []), r.id]);
  }

  const toStandalone: string[] = [];
  for (const r of rooms) {
    if (r.isProjectOverhead) continue;
    if (isLooseSlug(r.displayGroupId)) {
      toStandalone.push(r.id);
      continue;
    }
    if (r.displayGroupId!.startsWith("standalone-")) continue;
    const groupSize = counts.get(r.displayGroupId!)?.length ?? 0;
    if (groupSize < 2) {
      toStandalone.push(r.id);
    }
  }

  if (toStandalone.length > 0) {
    await prisma.$transaction(
      toStandalone.map((id) =>
        prisma.room.update({
          where: { id },
          data: { displayGroupId: `standalone-${id}`, displayGroupOrder: 0 },
        }),
      ),
    );
  }

  const liveSlugs = new Set<string>();
  for (const [slug, ids] of counts) {
    if (ids.length >= 2) liveSlugs.add(slug);
  }
  for (const id of toStandalone) {
    liveSlugs.add(`standalone-${id}`);
  }
  for (const r of rooms) {
    if (r.displayGroupId?.startsWith("standalone-")) {
      liveSlugs.add(r.displayGroupId);
    }
  }

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

async function main() {
  const projects = await prisma.project.findMany({
    select: { id: true, title: true },
  });
  console.log(`Found ${projects.length} project(s).`);

  let totalDissolvedRooms = 0;
  let totalPrunedSlugs = 0;
  for (const p of projects) {
    const result = await dissolveSingleMemberGroups(p.id);
    if (result.dissolvedRoomCount > 0 || result.prunedSlugs.length > 0) {
      console.log(
        `  - ${p.title} [${p.id}]: standaloned ${result.dissolvedRoomCount} room(s), pruned ${result.prunedSlugs.length} slug(s) (${result.prunedSlugs.join(", ")})`,
      );
    }
    totalDissolvedRooms += result.dissolvedRoomCount;
    totalPrunedSlugs += result.prunedSlugs.length;
  }

  console.log(
    `\nDone. Converted ${totalDissolvedRooms} room(s) to standalone-* slugs and pruned ${totalPrunedSlugs} stale slug(s).`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
