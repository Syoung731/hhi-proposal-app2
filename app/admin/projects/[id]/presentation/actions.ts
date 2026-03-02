"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { MediaKind, MediaType } from "@/app/generated/prisma";
import type { PresentationConfigSaved } from "@/app/lib/layout-config";

export type PresentationMediaSnapshotItem = {
  id: string;
  url: string;
  type: string;
  kind: string;
  roomId: string | null;
  parentMediaId: string | null;
};

export async function getPresentationMediaSnapshotAction(
  projectId: string
): Promise<
  { snapshot: PresentationMediaSnapshotItem[] } | { error: string }
> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      media: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          url: true,
          type: true,
          kind: true,
          roomId: true,
          parentMediaId: true,
        },
      },
    },
  });
  if (!project) return { error: "Project not found" };

  const snapshot: PresentationMediaSnapshotItem[] = project.media.map(
    (m) => ({
      id: m.id,
      url: m.url,
      type: m.type,
      kind: m.kind,
      roomId: m.roomId,
      parentMediaId: m.parentMediaId,
    })
  );
  return { snapshot };
}

/** Sync project.coverHeroImageId from config: accept existing media or COVER renderings with valid url. */
export async function savePresentationLayoutAction(
  projectId: string,
  config: PresentationConfigSaved
): Promise<{ error?: string }> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };

  const heroMediaId = config.pages?.cover?.heroMediaId ?? null;
  if (heroMediaId) {
    const media = await prisma.media.findFirst({
      where: { id: heroMediaId, projectId },
    });
    const validUrl = media?.url != null && media.url.trim() !== "";
    const isCoverRendering =
      media?.type === MediaType.RENDERING &&
      media?.kind === MediaKind.COVER &&
      media?.roomId == null;
    const isExisting = media != null && media.type !== MediaType.RENDERING;
    if (media && validUrl && (isExisting || isCoverRendering)) {
      await prisma.project.update({
        where: { id: projectId },
        data: { coverHeroImageId: heroMediaId },
      });
    }
  } else {
    await prisma.project.update({
      where: { id: projectId },
      data: { coverHeroImageId: null },
    });
  }

  let proposal = await prisma.proposal.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!proposal) {
    proposal = await prisma.proposal.create({
      data: { projectId, isPublic: false, publicLayoutConfig: config as object },
      select: { id: true },
    });
  } else {
    await prisma.proposal.update({
      where: { projectId },
      data: { publicLayoutConfig: config as object },
    });
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  revalidatePath(`/admin/projects/${projectId}/presentation`);
  revalidatePath(`/p/${proposal.id}`);
  revalidatePath(`/p/${proposal.id}/cover`);
  revalidatePath(`/p/${proposal.id}/objective`);
  revalidatePath(`/p/${proposal.id}/difference`);
  return {};
}
