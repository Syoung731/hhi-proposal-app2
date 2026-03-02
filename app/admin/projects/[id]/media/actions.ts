"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getPresignedUploadUrl, uploadBuffer } from "@/app/lib/s3";
import { generateRoomRendering, generateRenderEdit, compareSourceAndRenderImages } from "@/app/lib/gemini";
import { MediaKind, MediaPlacement, MediaType, RenderStatus } from "@/app/generated/prisma";
import type { HeroPresetKey } from "./hero-presets";

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
 * Front Page uploads (roomId null, type EXISTING) should pass placement=FRONT_PAGE so the item does not appear in Unassigned.
 */
export async function createMediaAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const projectId = formData.get("projectId") as string;
  const fileKey = formData.get("fileKey") as string;
  const url = formData.get("url") as string; // Must be the R2/public URL, not the presigned upload URL
  const type = (formData.get("type") as MediaType) ?? MediaType.EXISTING;
  const placementRaw = formData.get("placement") as string | null;
  const placement =
    placementRaw === "FRONT_PAGE"
      ? MediaPlacement.FRONT_PAGE
      : placementRaw === "SECTION"
        ? MediaPlacement.SECTION
        : undefined; // UNASSIGNED or not set
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
  const effectivePlacement =
    placement ??
    (roomId != null ? MediaPlacement.SECTION : MediaPlacement.UNASSIGNED);
  const maxOrder = await prisma.media
    .aggregate({
      where: {
        projectId,
        type,
        ...(roomId ? { roomId } : { roomId: null }),
      },
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
      placement: effectivePlacement,
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Replace project hero: delete existing HERO media for this project, then create new one.
 * Does not set project.coverHeroImageId (cover invariant: cover must be a COVER rendering). Use Front Page to create a COVER and set as proposal cover.
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
    await tx.media.create({
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

/**
 * Assign a room to media (e.g. from Unassigned section), or move to Front Page.
 * When roomId is set, placement becomes SECTION. When roomId is null, pass placement "FRONT_PAGE" to move to Front Page (so item leaves Unassigned).
 */
export async function updateMediaRoomAction(
  projectId: string,
  mediaId: string,
  roomId: string | null,
  placement?: MediaPlacement | "FRONT_PAGE" | "SECTION" | "UNASSIGNED"
): Promise<{ error?: string }> {
  await requireAdmin();
  const media = await prisma.media.findFirst({
    where: { id: mediaId, projectId },
  });
  if (!media) return { error: "Media not found" };
  if (media.type === MediaType.HERO) return { error: "Hero media cannot be assigned to a room" };
  const placementStr = placement as string | undefined;
  const placementValue: MediaPlacement =
    roomId != null
      ? MediaPlacement.SECTION
      : placementStr === "FRONT_PAGE" || placement === MediaPlacement.FRONT_PAGE
        ? MediaPlacement.FRONT_PAGE
        : placementStr === "SECTION" || placement === MediaPlacement.SECTION
          ? MediaPlacement.SECTION
          : MediaPlacement.UNASSIGNED;
  await prisma.media.update({
    where: { id: mediaId },
    data: { roomId, placement: placementValue },
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
  // If this media is the selected render concept for any room, clear the selection.
  if (media.type === MediaType.RENDERING) {
    await prisma.room.updateMany({
      where: {
        projectId,
        selectedRenderMediaId: mediaId,
      },
      data: {
        selectedRenderMediaId: null,
      },
    });
  }
  await prisma.media.delete({ where: { id: mediaId } });
  if (media.type === MediaType.HERO) {
    await prisma.project.update({
      where: { id: projectId },
      data: { coverHeroImageId: null },
    });
  } else if (media.id) {
    // If deleted media was the selected cover hero (e.g. a hero rendering), clear it
    await prisma.project.updateMany({
      where: { id: projectId, coverHeroImageId: media.id },
      data: { coverHeroImageId: null },
    });
  }
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Set the project's selected hero/cover image (project.coverHeroImageId).
 * Accepts: (1) existing media (type !== RENDERING) with valid url, or
 * (2) COVER renderings (type=RENDERING, kind=COVER, roomId=null) with valid url.
 * Rejects: invalid/missing url or media not belonging to the project.
 */
export async function setProjectHeroMediaAction(
  projectId: string,
  heroMediaId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!projectId || !heroMediaId) return { error: "Missing projectId or heroMediaId" };
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const media = await prisma.media.findFirst({
    where: { id: heroMediaId, projectId },
  });
  if (!media) return { error: "Media not found or does not belong to this project" };
  const validUrl = media.url != null && media.url.trim() !== "";
  if (!validUrl) return { error: "Media has no valid image URL" };
  const isCoverRendering =
    media.type === MediaType.RENDERING &&
    media.kind === MediaKind.COVER &&
    media.roomId == null;
  const isExisting = media.type !== MediaType.RENDERING;
  if (!isExisting && !isCoverRendering) {
    return {
      error:
        "Cover must be an existing upload or a COVER rendering (Front Page). Room renderings cannot be set as cover.",
    };
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { coverHeroImageId: heroMediaId },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Clear the project's selected cover hero (project.coverHeroImageId = null).
 */
export async function clearCoverHeroAction(
  projectId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!projectId) return { error: "Missing projectId" };
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  await prisma.project.update({
    where: { id: projectId },
    data: { coverHeroImageId: null },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Create a hero/cover render from ANY source media (existing upload or room rendering).
 * Uses the same Gemini edit pipeline as room "Update Render": generateRenderEdit → R2 upload → update Media.
 * New Media: type=RENDERING, kind=COVER, roomId=null, sourceMediaId=<selected id>, editInstruction stored.
 * Idempotent: we update the same Media row by id; no duplicate rows on retry.
 */
export async function startHeroRenderAction(
  projectId: string,
  sourceMediaId: string,
  presets: HeroPresetKey[],
  instructions: string
): Promise<
  | { ok: true; mediaId: string; id: string; renderStatus: string; url: string | null }
  | { error: string }
> {
  await requireAdmin();
  if (!projectId || !sourceMediaId) return { error: "Missing projectId or sourceMediaId" };
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const sourceMedia = await prisma.media.findFirst({
    where: { id: sourceMediaId, projectId },
  });
  if (!sourceMedia) return { error: "Source media not found" };
  const effectiveUrl =
    sourceMedia.type === MediaType.RENDERING
      ? sourceMedia.url?.trim() || null
      : sourceMedia.url?.trim() || null;
  if (!effectiveUrl) return { error: "Source has no image URL (upload or render must be complete)" };

  const maxOrder = await prisma.media
    .aggregate({
      where: { projectId, roomId: null, type: MediaType.RENDERING },
      _max: { sortOrder: true },
    })
    .then((r) => r._max.sortOrder ?? -1);

  const baseInstruction = [
    ...presets.map((p) => p.replace(/_/g, " ")),
    instructions?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(". ");

  const crop16x9Suffix = presets.includes("crop_16_9")
      ? " Output the image in 16:9 aspect ratio (width:height), cropped for a cover. Center the most important part of the image."
      : "";

  const finalInstruction =
    (baseInstruction + crop16x9Suffix).trim() ||
    "Improve the image for use as a proposal cover. Keep it photorealistic, no text or watermarks.";

  const created = await prisma.media.create({
    data: {
      projectId,
      roomId: null,
      kind: MediaKind.COVER,
      type: MediaType.RENDERING,
      url: "",
      fileKey: `hero-renders/pending/${sourceMediaId}/${Date.now()}`,
      caption: null,
      tags: [],
      sortOrder: maxOrder + 1,
      sourceMediaId: sourceMedia.id,
      parentMediaId: sourceMedia.id,
      editInstruction: finalInstruction,
      renderProvider: "gemini",
      renderModel: GEMINI_MODEL,
      renderStatus: RenderStatus.QUEUED,
    },
  });

  try {
    await prisma.media.update({
      where: { id: created.id },
      data: { renderStatus: RenderStatus.RENDERING, renderError: null },
    });

    const { bytes, mimeType } = await generateRenderEdit({
      imageUrl: effectiveUrl,
      instruction: finalInstruction,
    });

    const ext = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "jpg" : "png";
    const fileKey = `projects/${projectId}/cover/renderings/${created.id}.${ext}`;
    const contentType = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "image/jpeg" : "image/png";

    const { publicUrl } = await uploadBuffer(fileKey, bytes, contentType);

    await prisma.media.update({
      where: { id: created.id },
      data: {
        url: publicUrl,
        fileKey,
        renderStatus: RenderStatus.DONE,
        renderError: null,
      },
    });

    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/preview`);
    return {
      ok: true,
      mediaId: created.id,
      id: created.id,
      renderStatus: "DONE",
      url: publicUrl,
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await prisma.media
      .update({
        where: { id: created.id },
        data: {
          renderStatus: RenderStatus.FAILED,
          renderError: reason.slice(0, 500),
        },
      })
      .catch(() => {});
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/preview`);
    return { error: `Hero render failed: ${reason}` };
  }
}

/**
 * Delete a hero render (Media type RENDERING, roomId null). Clears project.coverHeroImageId if it pointed to this media.
 */
export async function deleteHeroRenderAction(
  projectId: string,
  mediaId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const media = await prisma.media.findFirst({
    where: { id: mediaId, projectId, type: MediaType.RENDERING, roomId: null },
  });
  if (!media) return { error: "Hero render not found" };
  await prisma.media.delete({ where: { id: mediaId } });
  await prisma.project.updateMany({
    where: { id: projectId, coverHeroImageId: mediaId },
    data: { coverHeroImageId: null },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Move media up/down within its group only (same projectId + type + roomId).
 * Room section order is NOT editable here; it follows Room.sortOrder on Sections tab.
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
 * Resolve effective style prompt for Media rendering: project-level preset only.
 * Returns null if no project preset; otherwise returns project.stylePreset.prompt.
 * When null, render must not inject any style guidance (scope + photo only).
 */
function getEffectiveStylePromptForProject(project: {
  stylePresetId: string | null;
  stylePreset: { id: string; prompt: string } | null;
}): string | null {
  if (!project.stylePresetId || !project.stylePreset?.prompt) return null;
  return project.stylePreset.prompt.trim() || null;
}

/**
 * Start room rendering for the given media (exactly one EXISTING photo).
 * Creates a pending RENDERING Media row with versioning metadata, then generates image via Gemini,
 * uploads to R2, updates the row with url/fileKey/status, and revalidates.
 * On failure, keeps the Media row with renderStatus=FAILED and renderError populated.
 * Style: only project.stylePresetId is used; if set, project.stylePreset.prompt is applied; otherwise no style guidance.
 */
export async function startRoomRenderAction(
  projectId: string,
  roomId: string,
  sourceMediaId: string
): Promise<
  | { ok: true; createdMediaId: string; fileKey: string }
  | { error: string }
> {
  await requireAdmin();
  if (!projectId || !roomId) return { error: "Missing projectId or roomId" };
  if (!sourceMediaId) {
    return { error: "Source photo is required" };
  }

  // Enforce hard cap of 3 root renderings per room (parentMediaId null only).
  const rootRenderCount = await prisma.media.count({
    where: {
      projectId,
      roomId,
      type: MediaType.RENDERING,
      parentMediaId: null,
    },
  });
  if (rootRenderCount >= 3) {
    return {
      error: "Max 3 root renders per room. Delete one to generate another.",
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { stylePreset: { select: { id: true, name: true, prompt: true } } },
  });
  if (!project) return { error: "Project not found" };
  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
  });
  if (!room) return { error: "Room not found" };
  const sourceMedia = await prisma.media.findFirst({
    where: { id: sourceMediaId, projectId, roomId },
  });
  if (!sourceMedia) {
    return { error: "Source photo not found or does not belong to this project and room" };
  }
  if (sourceMedia.type !== MediaType.EXISTING) {
    return { error: "Source must be an existing photo" };
  }

  const stylePresetPrompt = getEffectiveStylePromptForProject(project) ?? "";
  const effectivePresetId = project.stylePresetId;
  const effectivePreset = project.stylePreset;
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
      renderStatus: RenderStatus.QUEUED,
      promptVersion,
    },
  });

  try {
    // Mark as actively rendering while we call the provider.
    await prisma.media.update({
      where: { id: created.id },
      data: {
        renderStatus: RenderStatus.RENDERING,
        renderError: null,
      },
    });

    const { bytes, mimeType } = await generateRoomRendering({
      imageUrl: sourceMedia.url,
      roomName: room.name,
      scopeNarrative: room.scopeNarrative ?? "",
      transcriptText: project.transcriptText ?? undefined,
      stylePresetPrompt: stylePresetPrompt || undefined,
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
        renderStatus: RenderStatus.DONE,
        renderError: null,
      },
    });

    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/preview`);
    return { ok: true, createdMediaId: created.id, fileKey };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await prisma.media.update({
      where: { id: created.id },
      data: {
        renderStatus: RenderStatus.FAILED,
        renderError: reason.slice(0, 500),
      },
    }).catch(() => {});
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

/**
 * Mark a specific render as the selected concept for a room.
 * Validates that the media belongs to the project+room and is a RENDERING with DONE status.
 */
export async function setSelectedRenderAction(
  projectId: string,
  roomId: string,
  mediaId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!projectId || !roomId || !mediaId) {
    return { error: "Missing projectId, roomId, or mediaId" };
  }

  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
  });
  if (!room) return { error: "Room not found" };

  const media = await prisma.media.findFirst({
    where: {
      id: mediaId,
      projectId,
      roomId,
      type: MediaType.RENDERING,
    },
  });
  if (!media) {
    return { error: "Render not found for this room" };
  }
  if (media.renderStatus !== RenderStatus.DONE) {
    return { error: "Only completed renders can be selected." };
  }

  await prisma.room.update({
    where: { id: roomId },
    data: {
      selectedRenderMediaId: mediaId,
    },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Clear the selected render for a room (set selectedRenderMediaId to null).
 * Validates admin and project/room ownership.
 */
export async function clearSelectedRenderAction(
  projectId: string,
  roomId: string
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin();
  if (!projectId || !roomId) {
    return { error: "Missing projectId or roomId" };
  }

  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
  });
  if (!room) return { error: "Room not found" };

  await prisma.room.update({
    where: { id: roomId },
    data: { selectedRenderMediaId: null },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return { ok: true };
}

const INSTRUCTION_MIN_LEN = 3;
const INSTRUCTION_MAX_LEN = 500;

/**
 * Start an "Update Render" (Gemini edit): create a new RENDERING Media from a DONE render
 * using image-to-image edit with the given instruction. New row uses base render's sourceMediaId
 * so it stays in the same before-photo group; parentMediaId points to the base render.
 * Counts toward max 3 renderings per room.
 */
export async function startRenderUpdateAction(
  projectId: string,
  roomId: string,
  baseRenderMediaId: string,
  instruction: string
): Promise<
  | { ok: true; mediaId: string; createdMediaId: string; fileKey: string }
  | { error: string }
> {
  await requireAdmin();
  if (!projectId || !roomId || !baseRenderMediaId) {
    return { error: "Missing projectId, roomId, or base render" };
  }

  const trimmed = instruction?.trim() ?? "";
  if (trimmed.length < INSTRUCTION_MIN_LEN) {
    return { error: "Instruction must be at least 3 characters." };
  }
  if (trimmed.length > INSTRUCTION_MAX_LEN) {
    return { error: `Instruction must be ${INSTRUCTION_MAX_LEN} characters or less.` };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { stylePreset: { select: { id: true, name: true, prompt: true } } },
  });
  if (!project) return { error: "Project not found" };

  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
  });
  if (!room) return { error: "Room not found" };

  const baseRender = await prisma.media.findFirst({
    where: {
      id: baseRenderMediaId,
      projectId,
      roomId,
      type: MediaType.RENDERING,
    },
  });
  if (!baseRender) {
    return { error: "Base render not found or does not belong to this room" };
  }
  if (baseRender.renderStatus !== RenderStatus.DONE) {
    return { error: "Only completed renders can be updated" };
  }
  if (!baseRender.url?.trim() || baseRender.fileKey?.startsWith("renderings/pending/")) {
    return { error: "Base render has no valid image to update" };
  }

  // Resolve root of this render (base may be an update; root has parentMediaId null).
  const rootId = baseRender.parentMediaId ?? baseRenderMediaId;
  const rootMedia = await prisma.media.findFirst({
    where: { id: rootId, projectId, roomId, type: MediaType.RENDERING },
  });
  if (!rootMedia) {
    return { error: "Base render root not found" };
  }
  const effectiveRootId = rootMedia.parentMediaId ?? rootMedia.id;

  // Enforce max 3 updates per root (children where parentMediaId === effectiveRootId).
  const updateCount = await prisma.media.count({
    where: {
      projectId,
      roomId,
      type: MediaType.RENDERING,
      parentMediaId: effectiveRootId,
    },
  });
  if (updateCount >= 3) {
    return {
      error: "Max 3 updates per render. Delete one to add another.",
    };
  }

  const stylePresetPrompt = getEffectiveStylePromptForProject(project) ?? "";
  const effectivePresetId = project.stylePresetId;
  const effectivePreset = project.stylePreset;

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
      fileKey: `renderings/pending/${baseRender.id}/${Date.now()}`,
      caption: null,
      tags: [],
      sortOrder: maxOrder + 1,
      sourceMediaId: baseRender.sourceMediaId,
      parentMediaId: baseRenderMediaId,
      editInstruction: trimmed,
      stylePresetId: effectivePresetId,
      renderProvider: "gemini",
      renderModel: GEMINI_MODEL,
      renderStatus: RenderStatus.QUEUED,
      promptVersion: baseRender.promptVersion,
    },
  });

  try {
    await prisma.media.update({
      where: { id: created.id },
      data: {
        renderStatus: RenderStatus.RENDERING,
        renderError: null,
      },
    });

    const { bytes, mimeType } = await generateRenderEdit({
      imageUrl: baseRender.url,
      instruction: trimmed,
      stylePresetPrompt: stylePresetPrompt || undefined,
    });

    const ext = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "jpg" : "png";
    const fileKey = `projects/${projectId}/rooms/${roomId}/renderings/${created.id}.${ext}`;
    const contentType = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "image/jpeg" : "image/png";

    const { publicUrl } = await uploadBuffer(fileKey, bytes, contentType);

    const tags = ["AI_RENDERED", "EDIT", ...(effectivePreset?.name ? [`STYLE:${effectivePreset.name}`] : [])];
    await prisma.media.update({
      where: { id: created.id },
      data: {
        url: publicUrl,
        fileKey,
        tags,
        renderStatus: RenderStatus.DONE,
        renderError: null,
      },
    });

    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/preview`);
    return { ok: true, mediaId: created.id, createdMediaId: created.id, fileKey };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await prisma.media.update({
      where: { id: created.id },
      data: {
        renderStatus: RenderStatus.FAILED,
        renderError: reason.slice(0, 500),
      },
    }).catch(() => {});
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/preview`);
    return { error: `Update failed: ${reason}` };
  }
}

export type GetCompareRenderChangesResult =
  | { ok: true; bullets: string[]; rawText?: string }
  | { error: string };

/**
 * Compare source vs render image with vision on-demand; return 3–6 bullet differences or "No meaningful differences detected."
 * No DB caching (renderChangeSummary table not used).
 */
export async function getCompareRenderChangesAction(
  projectId: string,
  sourceMediaId: string,
  renderMediaId: string
): Promise<GetCompareRenderChangesResult> {
  await requireAdmin();
  if (!projectId || !sourceMediaId || !renderMediaId) {
    return { error: "Missing projectId, sourceMediaId, or renderMediaId" };
  }

  const [sourceMedia, renderMedia] = await Promise.all([
    prisma.media.findFirst({
      where: { id: sourceMediaId, projectId },
      select: { id: true, url: true },
    }),
    prisma.media.findFirst({
      where: { id: renderMediaId, projectId },
      select: { id: true, url: true, sourceMediaId: true },
    }),
  ]);

  if (!sourceMedia?.url?.trim()) {
    return { error: "Source media not found or has no URL" };
  }
  if (!renderMedia?.url?.trim()) {
    return { error: "Render media not found or has no URL" };
  }
  if (renderMedia.sourceMediaId !== sourceMediaId) {
    return { error: "Render is not derived from this source" };
  }

  try {
    const result = await compareSourceAndRenderImages(sourceMedia.url, renderMedia.url);
    const bullets =
      result.differences != null && result.differences.length > 0
        ? result.differences
        : ["No meaningful differences detected."];
    return { ok: true, bullets };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: message };
  }
}
