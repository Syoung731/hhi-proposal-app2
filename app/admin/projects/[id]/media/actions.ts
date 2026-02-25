"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getPresignedUploadUrl, uploadBuffer } from "@/app/lib/s3";
import { generateRoomRendering } from "@/app/lib/gemini";
import { MediaKind, MediaType } from "@/app/generated/prisma";

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
    // Returns uploadUrl (for PUT) and publicUrl (save this to DB, not uploadUrl)
    return await getPresignedUploadUrl(fileKey, contentType);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate upload URL";
    return { error: message };
  }
}

/**
 * Create a media record. Use publicUrl (from getPresignedUploadUrl) as url, not the presigned uploadUrl.
 * HERO must have roomId = null. EXISTING/RENDERING typically have roomId set.
 */
export async function createMediaAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const projectId = formData.get("projectId") as string;
  const fileKey = formData.get("fileKey") as string;
  const url = formData.get("url") as string; // Must be the R2/public URL, not the presigned upload URL
  const type = (formData.get("type") as MediaType) ?? MediaType.EXISTING;
  const caption = (formData.get("caption") as string)?.trim() || null;
  const tagsStr = (formData.get("tags") as string)?.trim();
  const tags = tagsStr ? tagsStr.split(/[\s,]+/).filter(Boolean) : [];
  let roomId = (formData.get("roomId") as string) || null;
  if (!projectId || !fileKey || !url) {
    return { error: "Missing projectId, fileKey, or url" };
  }
  // HERO must have roomId = null
  if (type === MediaType.HERO) roomId = null;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  // Max sortOrder within the same group (projectId + type + roomId)
  const groupWhere = {
    projectId,
    type,
    ...(roomId ? { roomId } : { roomId: null }),
  };
  const maxOrder = await prisma.media
    .aggregate({
      where: groupWhere,
      _max: { sortOrder: true },
    })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.media.create({
    data: {
      projectId,
      roomId: roomId || undefined,
      kind: type === MediaType.HERO ? MediaKind.COVER : MediaKind.OTHER,
      type,
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

/**
 * Replace project hero: delete existing HERO media for this project, then create new one.
 * Also sets project.coverHeroImageId so Overview/draft views keep working.
 */
export async function setHeroAction(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const url = formData.get("url") as string;
  const fileKey = formData.get("fileKey") as string;
  const caption = (formData.get("caption") as string)?.trim() || null;
  if (!projectId || !url || !fileKey) {
    return { error: "Missing projectId, url, or fileKey" };
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const existingHero = await prisma.media.findFirst({
    where: { projectId, type: MediaType.HERO },
  });
  await prisma.$transaction(async (tx) => {
    if (existingHero) {
      await tx.media.delete({ where: { id: existingHero.id } });
    }
    const media = await tx.media.create({
      data: {
        projectId,
        roomId: null,
        kind: MediaKind.COVER,
        type: MediaType.HERO,
        url,
        fileKey,
        caption: caption ?? "Hero",
        tags: ["hero"],
        sortOrder: 0,
      },
    });
    await tx.project.update({
      where: { id: projectId },
      data: { coverHeroImageId: media.id },
    });
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
  const roomId = (formData.get("roomId") as string) ?? undefined;
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
      ...(roomId !== undefined && { roomId: roomId === "" ? null : roomId }),
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/** Update only caption. Used by Media tab caption edit. */
export async function updateMediaCaptionAction(
  projectId: string,
  mediaId: string,
  caption: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const media = await prisma.media.findFirst({
    where: { id: mediaId, projectId },
  });
  if (!media) return { error: "Media not found" };
  await prisma.media.update({
    where: { id: mediaId },
    data: { caption: caption?.trim() || null },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/** Assign a room to media (e.g. from Unassigned section). Keeps type unchanged. */
export async function updateMediaRoomAction(
  projectId: string,
  mediaId: string,
  roomId: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const media = await prisma.media.findFirst({
    where: { id: mediaId, projectId },
  });
  if (!media) return { error: "Media not found" };
  if (media.type === MediaType.HERO) return { error: "Hero media cannot be assigned to a room" };
  await prisma.media.update({
    where: { id: mediaId },
    data: { roomId },
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
  if (media.type === MediaType.HERO) {
    await prisma.project.update({
      where: { id: projectId },
      data: { coverHeroImageId: null },
    });
  }
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Move media up/down within its group only (same projectId + type + roomId).
 * Room section order is NOT editable here; it follows Room.sortOrder on Rooms tab.
 */
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
  const groupWhere = {
    projectId,
    type: media.type,
    ...(media.roomId ? { roomId: media.roomId } : { roomId: null }),
  };
  const list = await prisma.media.findMany({
    where: groupWhere,
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

/**
 * Reorder media by assigning sortOrder from the given orderedIds (index = sortOrder).
 * Validates projectId and ensures all ids belong to the project; updates in a transaction.
 */
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-image";

/**
 * Start room rendering for the given media (exactly one EXISTING photo).
 * Creates a pending RENDERING Media row with versioning metadata, then generates image via Gemini,
 * uploads to R2, updates the row with url/fileKey, and revalidates. On failure, deletes the pending row.
 * effectivePresetId: optional; if not provided, uses room.stylePresetId ?? project.stylePresetId ?? first active preset.
 */
export async function startRoomRenderAction(
  projectId: string,
  roomId: string,
  mediaIds: string[],
  stylePresetId?: string | null
): Promise<
  | { ok: true; createdMediaId: string; fileKey: string }
  | { error: string }
> {
  await requireAdmin();
  if (!projectId || !roomId) return { error: "Missing projectId or roomId" };
  if (!mediaIds || mediaIds.length !== 1) {
    return { error: "Exactly one source photo must be selected" };
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { stylePreset: { select: { id: true, prompt: true } } },
  });
  if (!project) return { error: "Project not found" };
  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    include: { stylePreset: { select: { id: true, prompt: true } } },
  });
  if (!room) return { error: "Room not found" };
  const sourceMedia = await prisma.media.findFirst({
    where: { id: mediaIds[0]!, projectId, roomId },
  });
  if (!sourceMedia) {
    return { error: "Source photo not found or does not belong to this project and room" };
  }
  if (sourceMedia.type !== MediaType.EXISTING) {
    return { error: "Source must be an existing photo" };
  }

  // Resolve effective preset: explicit > room > project > first active
  let effectivePresetId: string | null = stylePresetId ?? null;
  if (!effectivePresetId && room.stylePreset?.id) effectivePresetId = room.stylePreset.id;
  if (!effectivePresetId && project.stylePreset?.id) effectivePresetId = project.stylePreset.id;
  if (!effectivePresetId) {
    const first = await prisma.stylePreset.findFirst({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    if (first) effectivePresetId = first.id;
  }
  const effectivePreset = effectivePresetId
    ? await prisma.stylePreset.findUnique({ where: { id: effectivePresetId }, select: { prompt: true, name: true } })
    : null;
  const stylePresetPrompt = effectivePreset?.prompt ?? "";
  const promptVersion = 1;

  const maxOrder = await prisma.media
    .aggregate({
      where: { projectId, roomId, type: MediaType.RENDERING },
      _max: { sortOrder: true },
    })
    .then((r) => r._max.sortOrder ?? -1);
  const created = await prisma.media.create({
    data: {
      projectId,
      roomId,
      kind: MediaKind.OTHER,
      type: MediaType.RENDERING,
      url: "",
      fileKey: `renderings/pending/${sourceMedia.id}/${Date.now()}`,
      caption: null,
      tags: [],
      sortOrder: maxOrder + 1,
      sourceMediaId: sourceMedia.id,
      stylePresetId: effectivePresetId,
      renderProvider: "gemini",
      renderModel: GEMINI_MODEL,
      promptVersion,
    },
  });

  try {
    const { bytes, mimeType } = await generateRoomRendering({
      imageUrl: sourceMedia.url,
      roomName: room.name,
      scopeNarrative: room.scopeNarrative ?? "",
      transcriptText: project.transcriptText ?? undefined,
      stylePresetPrompt,
      promptVersion,
    });

    const ext = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "jpg" : "png";
    const fileKey = `projects/${projectId}/rooms/${roomId}/renderings/${created.id}.${ext}`;
    const contentType = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "image/jpeg" : "image/png";

    const { publicUrl } = await uploadBuffer(fileKey, bytes, contentType);

    const tags = ["AI_RENDERED", ...(effectivePreset?.name ? [`STYLE:${effectivePreset.name}`] : [])];
    await prisma.media.update({
      where: { id: created.id },
      data: {
        url: publicUrl,
        fileKey,
        tags,
      },
    });

    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/preview`);
    return { ok: true, createdMediaId: created.id, fileKey };
  } catch (e) {
    await prisma.media.delete({ where: { id: created.id } }).catch(() => {});
    const reason = e instanceof Error ? e.message : String(e);
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/preview`);
    return { error: `Render failed: ${reason}` };
  }
}

export async function reorderMediaAction(
  projectId: string,
  orderedIds: string[]
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!orderedIds.length) return {};
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const mediaInProject = await prisma.media.findMany({
    where: { id: { in: orderedIds }, projectId },
    select: { id: true },
  });
  const foundIds = new Set(mediaInProject.map((m) => m.id));
  const invalid = orderedIds.filter((id) => !foundIds.has(id));
  if (invalid.length > 0) return { error: "Some media do not belong to this project" };
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.media.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}
