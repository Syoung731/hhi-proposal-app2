"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redeemExtensionPairCode } from "@/app/lib/extension-pair-code";
import {
  createConnectionSession,
  getCurrentConnectionStatus,
  markConnectionFailed,
} from "@/app/lib/zillow-browser-connection";
import { getPresignedUploadUrl, uploadBuffer } from "@/app/lib/s3";
import {
  signBulkUploadUrls,
  commitMediaBatch,
  BULK_CREATE_MAX,
  type BulkPresignedUrl as PipelineBulkPresignedUrl,
  type CommitMediaItem,
  type CommitMediaResult,
} from "@/app/lib/media/upload-pipeline";
import {
  generateUploadToken,
  PHOTO_UPLOAD_TOKEN_TTL_MS,
} from "@/app/lib/media/photo-upload-token";
import { generateRenderEdit, compareSourceAndRenderImages } from "@/app/lib/gemini";
import {
  getEffectiveStylePromptForProject,
  renderRoomCore,
} from "@/app/lib/gemini/render-room-core";
import { MediaKind, MediaPlacement, MediaType, RenderStatus } from "@/app/generated/prisma";
import { callClaude } from "@/app/lib/ai/model";
import { getRendrSpaceDetail, streamRendrPhoto } from "@/app/lib/rendr/rendrClient";
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
  // For Zillow imports (Phase 4): include tag "zillow" so media appears on the Imported from Zillow page.
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

const ADDITIONAL_SECTIONS_KEY = "additionalSections";

/**
 * Remove a media id from presentation config (beforeSelectedMediaIds, afterSelectedMediaIds, featuredConceptMediaId)
 * so no broken references remain when media is removed from a section or deleted.
 * - If onlyRoomId is set, only that section is updated (e.g. when unassigning from one room).
 * - If onlyRoomId is not set, all sections are updated (e.g. when deleting media).
 */
async function removeMediaIdFromPresentationConfig(
  projectId: string,
  mediaId: string,
  options?: { onlyRoomId?: string }
): Promise<void> {
  const proposal = await prisma.proposal.findUnique({
    where: { projectId },
    select: { id: true, publicLayoutConfig: true },
  });
  if (!proposal?.publicLayoutConfig || typeof proposal.publicLayoutConfig !== "object") return;
  const config = proposal.publicLayoutConfig as {
    pages?: { sections?: Record<string, { beforeSelectedMediaIds?: string[]; afterSelectedMediaIds?: string[]; featuredConceptMediaId?: string | null }> };
  };
  const sections = config.pages?.sections;
  if (!sections || typeof sections !== "object") return;
  let changed = false;
  const nextSections = { ...sections };
  for (const key of Object.keys(nextSections)) {
    if (key === ADDITIONAL_SECTIONS_KEY) continue;
    if (options?.onlyRoomId != null && key !== options.onlyRoomId) continue;
    const section = nextSections[key];
    if (!section || typeof section !== "object") continue;
    const before = Array.isArray(section.beforeSelectedMediaIds) ? section.beforeSelectedMediaIds.filter((id) => id !== mediaId) : [];
    const after = Array.isArray(section.afterSelectedMediaIds) ? section.afterSelectedMediaIds.filter((id) => id !== mediaId) : [];
    const featured = section.featuredConceptMediaId === mediaId ? null : section.featuredConceptMediaId;
    if (before.length !== (section.beforeSelectedMediaIds?.length ?? 0) || after.length !== (section.afterSelectedMediaIds?.length ?? 0) || featured !== section.featuredConceptMediaId) {
      nextSections[key] = { ...section, beforeSelectedMediaIds: before, afterSelectedMediaIds: after, featuredConceptMediaId: featured };
      changed = true;
    }
  }
  if (changed) {
    await prisma.proposal.update({
      where: { projectId },
      data: { publicLayoutConfig: { ...config, pages: { ...config.pages, sections: nextSections } } as object },
    });
  }
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
  // When unassigning from a room, clear this media from that section's presentation config so no broken refs remain.
  if (roomId == null && media.roomId) {
    await removeMediaIdFromPresentationConfig(projectId, mediaId, { onlyRoomId: media.roomId });
  }
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Link a RENDERING-type media to a "Before" photo by setting sourceMediaId.
 * Used to repair room-orphan concepts (room-linked but with no Before-photo
 * binding) so they show up under that photo in the per-photo render panel
 * and on the Before/After deck slide. Both records must be in the same
 * project; the Before photo must already be in the same room as the
 * rendering.
 */
export async function linkRenderingToBeforePhotoAction(
  projectId: string,
  renderingMediaId: string,
  beforeMediaId: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  const [rendering, beforePhoto] = await Promise.all([
    prisma.media.findFirst({ where: { id: renderingMediaId, projectId } }),
    prisma.media.findFirst({ where: { id: beforeMediaId, projectId } }),
  ]);
  if (!rendering) return { error: "Rendering not found" };
  if (rendering.type !== MediaType.RENDERING) return { error: "Media is not a rendering" };
  if (!beforePhoto) return { error: "Before photo not found" };
  if (beforePhoto.type === MediaType.RENDERING) return { error: "Cannot link a rendering to another rendering" };
  if (rendering.roomId == null) return { error: "Rendering is not assigned to a section" };
  if (beforePhoto.roomId !== rendering.roomId) return { error: "Before photo and rendering must be in the same section" };
  await prisma.media.update({
    where: { id: renderingMediaId },
    data: { sourceMediaId: beforeMediaId },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/**
 * Import selected Rendr photos into the project as EXISTING Media records.
 * Each imported photo is tagged with "rendr" and "rendr-photo:<photoId>" so we can
 * detect re-imports and filter the Rendr Photos view.
 * Assignment: if roomId is set → SECTION; if frontPage=true → FRONT_PAGE (roomId=null); else UNASSIGNED.
 */
export async function importRendrPhotosAction(
  projectId: string,
  photoIds: string[],
  target: { roomId: string | null; frontPage: boolean },
): Promise<{ imported: number; skipped: number; error?: string }> {
  await requireAdmin();
  if (!photoIds.length) return { imported: 0, skipped: 0 };
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, rendrSpaceId: true },
  });
  if (!project) return { imported: 0, skipped: 0, error: "Project not found" };
  if (!project.rendrSpaceId) return { imported: 0, skipped: 0, error: "Project is not linked to a Rendr space" };

  let spaceDetail;
  try {
    spaceDetail = await getRendrSpaceDetail(project.rendrSpaceId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load Rendr space";
    return { imported: 0, skipped: 0, error: msg };
  }
  const photoById = new Map(spaceDetail.photos.map((p) => [p.id, p]));

  const placement: MediaPlacement =
    target.roomId != null
      ? MediaPlacement.SECTION
      : target.frontPage
        ? MediaPlacement.FRONT_PAGE
        : MediaPlacement.UNASSIGNED;

  // Use a single starting sortOrder baseline per target bucket to keep order stable.
  const maxOrder = await prisma.media
    .aggregate({
      where: {
        projectId,
        type: MediaType.EXISTING,
        ...(target.roomId ? { roomId: target.roomId } : { roomId: null }),
      },
      _max: { sortOrder: true },
    })
    .then((r) => r._max.sortOrder ?? -1);

  let imported = 0;
  let skipped = 0;
  let nextOrder = maxOrder + 1;
  for (const photoId of photoIds) {
    const photo = photoById.get(photoId);
    if (!photo) {
      skipped++;
      continue;
    }
    try {
      const res = await streamRendrPhoto(photo.space_photo_url);
      if (!res.ok) {
        skipped++;
        continue;
      }
      const contentType = res.headers.get("Content-Type") || "image/jpeg";
      const extFromType =
        contentType.includes("png") ? "png" :
        contentType.includes("webp") ? "webp" :
        contentType.includes("heic") ? "heic" :
        "jpg";
      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      const fileKey = `projects/${projectId}/rendr-${Date.now()}-${Math.random().toString(36).slice(2)}.${extFromType}`;
      const { publicUrl } = await uploadBuffer(fileKey, buf, contentType);
      await prisma.media.create({
        data: {
          projectId,
          roomId: target.roomId ?? undefined,
          kind: MediaKind.OTHER,
          type: MediaType.EXISTING,
          url: publicUrl,
          fileKey,
          caption: null,
          tags: ["rendr", `rendr-photo:${photoId}`],
          sortOrder: nextOrder++,
          placement,
        },
      });
      imported++;
    } catch {
      skipped++;
    }
  }
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return { imported, skipped };
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
  // Remove this media from all section presentation configs (beforeSelectedMediaIds, etc.) so no broken refs remain.
  await removeMediaIdFromPresentationConfig(projectId, mediaId);
  // For a RENDERING root with children (versions), promote the oldest child to the new root
  // and reparent the remaining children to it, rather than cascading. Deleting one version
  // must not take the rest of the concept with it.
  if (media.type === MediaType.RENDERING && media.parentMediaId == null) {
    const children = await prisma.media.findMany({
      where: { parentMediaId: mediaId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (children.length > 0) {
      const newRootId = children[0].id;
      await prisma.media.update({
        where: { id: newRootId },
        data: { parentMediaId: null },
      });
      const siblingIds = children.slice(1).map((c) => c.id);
      if (siblingIds.length > 0) {
        await prisma.media.updateMany({
          where: { id: { in: siblingIds } },
          data: { parentMediaId: newRootId },
        });
      }
    }
  } else if (media.type === MediaType.RENDERING && media.parentMediaId != null) {
    // Deleting a non-root version: reparent any grandchildren up to this node's parent so they
    // stay in the same concept group. (UI tree is depth-2 in practice, but defensive.)
    await prisma.media.updateMany({
      where: { parentMediaId: mediaId },
      data: { parentMediaId: media.parentMediaId },
    });
  } else {
    // Non-rendering media: original cascade (EXISTING/HERO don't have version trees).
    await prisma.media.deleteMany({ where: { parentMediaId: mediaId } });
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
 * Clean up orphaned rendering records:
 * 1. Renderings with parentMediaId=null AND sourceMediaId=null — these are former children
 *    that lost both their parent reference and their source reference. They're never valid roots.
 * 2. For each (roomId, sourceMediaId) group with multiple roots, keep the one that is currently
 *    selectedRenderMediaId (or oldest) and delete the rest.
 */
export async function cleanupOrphanedRenderingsAction(projectId: string): Promise<{ deleted: number }> {
  await requireAdmin();

  const potentialRoots = await prisma.media.findMany({
    where: { projectId, type: MediaType.RENDERING, parentMediaId: null },
    select: { id: true, roomId: true, sourceMediaId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Also load rooms to know which renders are selected
  const rooms = await prisma.room.findMany({
    where: { projectId },
    select: { id: true, selectedRenderMediaId: true },
  });
  const selectedIds = new Set(rooms.map((r) => r.selectedRenderMediaId).filter(Boolean) as string[]);

  const orphanIds: string[] = [];

  // Strategy 1: Any RENDERING with parentMediaId=null AND sourceMediaId=null is an orphan.
  // Real root concepts always have a sourceMediaId pointing to the before photo.
  for (const r of potentialRoots) {
    if (r.sourceMediaId == null && r.roomId != null && !selectedIds.has(r.id)) {
      orphanIds.push(r.id);
    }
  }

  // Strategy 2: For each (roomId, sourceMediaId) group, if there are duplicate roots,
  // keep the selected one (or oldest) and mark the rest as orphans.
  const groups = new Map<string, typeof potentialRoots>();
  for (const r of potentialRoots) {
    if (r.sourceMediaId == null) continue; // already handled above
    const key = `${r.roomId ?? "null"}::${r.sourceMediaId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    // Prefer the selected one; fall back to oldest
    const keeper = group.find((r) => selectedIds.has(r.id)) ?? group[0];
    for (const r of group) {
      if (r.id !== keeper.id) orphanIds.push(r.id);
    }
  }

  if (orphanIds.length === 0) return { deleted: 0 };

  // Clear selectedRenderMediaId on rooms that reference orphans
  await prisma.room.updateMany({
    where: { projectId, selectedRenderMediaId: { in: orphanIds } },
    data: { selectedRenderMediaId: null },
  });

  // Delete children of orphans first, then the orphans themselves
  await prisma.media.deleteMany({ where: { parentMediaId: { in: orphanIds } } });
  const result = await prisma.media.deleteMany({ where: { id: { in: orphanIds } } });

  if (result.count > 0) {
    revalidatePath(`/admin/projects/${projectId}`);
  }

  return { deleted: result.count };
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

  const presetToInstruction = (p: HeroPresetKey): string => {
    if (p === "remove_watermark") {
      return "Remove all visible text, watermarking, branding, logos, timestamps, and lettering from the image, including faint or semi-transparent overlays such as 'REsides 2025' or similar listing-site text. Cleanly reconstruct the background underneath so it looks natural and untouched. Do not change the architecture, landscaping, lighting, colors, or composition except where necessary to remove the text overlays.";
    }
    return p.replace(/_/g, " ");
  };
  const baseInstruction = [
    ...presets.map(presetToInstruction),
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
      renderModel: await _getGeminiImgModel(),
      renderStatus: RenderStatus.QUEUED,
    },
  });

  try {
    await prisma.media.update({
      where: { id: created.id },
      data: { renderStatus: RenderStatus.RENDERING, renderError: null },
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("[Front Page AI] sourceMediaId:", sourceMediaId);
      console.log("[Front Page AI] selected options:", presets);
      console.log("[Front Page AI] custom instruction:", instructions?.trim() ?? "(none)");
      console.log("[Front Page AI] removeTextWatermark:", presets.includes("remove_watermark"));
      console.log("[Front Page AI] final instruction:", finalInstruction);
    }

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
import { getGeminiImageModel as _getGeminiImgModel } from "@/app/lib/ai/gemini-models";
// GEMINI_MODEL removed — now read from DB via getGeminiImageModel()

// ---------------------------------------------------------------------------
// Render checklist extraction — uses Claude to pull visual-only items from scope
// ---------------------------------------------------------------------------

const RENDER_CHECKLIST_SYSTEM = `You extract a rendering checklist from a room's scope of work. The checklist is for an AI image generator that will create a "before and after" rendering of the room renovation.

RULES:
1. Return ONLY a JSON array of short action strings. No explanation, no markdown.
2. Include ONLY items that would be VISIBLE in a finished photo of the room:
   - Fixture changes: tubs, showers, toilets, sinks, faucets, vanities
   - Surface changes: tile, flooring, countertops, backsplash, paint, wall finishes
   - Cabinetry and built-ins
   - Lighting fixtures, mirrors, hardware
   - Doors, trim, molding, wainscoting
   - Heated towel racks, glass enclosures, shower niches, benches
3. EXCLUDE anything invisible in a photo:
   - Plumbing rough-in, supply lines, drain lines, valves
   - Electrical wiring, circuits, panels
   - Structural work: framing, joists, subfloor, blocking
   - Substrate: waterproofing membrane, backer board, underlayment
   - HVAC, insulation, vapor barriers
   - Demolition, debris removal, protection
   - Permits, inspections, code compliance
   - Caulking, sealant, grout sealer
4. Each item should be 3-8 words, starting with a verb (Remove, Install, Replace, Add, Paint).
5. Group removals first, then new installations.
6. When CLARIFICATION ANSWERS are provided, use them to refine descriptions with specific details (e.g., if answer says "freestanding floor-mounted", say "Install freestanding soaking tub" not just "Install tub"). Answers override or supplement the scope narrative.
7. Return 5-15 items. Combine related small items; split large compound items.

Example output:
["Remove heart-shaped jetted tub","Remove octagonal shower enclosure","Install freestanding soaking tub","Install walk-in tiled shower","Replace vanity with stone countertop","Install floor and wall tile","Replace toilet","Install recessed lighting","Install heated towel rack","Paint walls and ceiling"]`;

/**
 * Extract a visual-only rendering checklist from a room's scope narrative using Claude.
 * Results are cached in the room's scopeQA JSON field under the key "renderChecklist".
 * Returns the checklist items, or falls back to an empty array on error.
 */
export async function extractRenderChecklistAction(roomId: string): Promise<string[]> {
  await requireAdmin();

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { projectId: true, scopeNarrative: true, scopeQA: true },
  });
  if (!room?.scopeNarrative) return [];

  // Build structured Q&A text from scopeQA.questions (if answers exist)
  const existingQA = room.scopeQA as Record<string, unknown> | null;
  const qaQuestions = Array.isArray(existingQA?.questions) ? existingQA.questions as { question: string; answer: unknown; unit?: string | null }[] : [];
  const answeredQA = qaQuestions.filter((q) => q.answer != null && q.answer !== "");
  const qaText = answeredQA.length > 0
    ? answeredQA.map((q) => {
        const unit = q.unit ? ` ${q.unit}` : "";
        const answer = typeof q.answer === "boolean" ? (q.answer ? "Yes" : "No") : q.answer;
        return `- ${q.question}: ${answer}${unit}`;
      }).join("\n")
    : "";

  // Check cache — hash includes both scope narrative and Q&A answers
  const cacheInput = room.scopeNarrative + (qaText ? `\n---QA---\n${qaText}` : "");
  const scopeHash = simpleHash(cacheInput);
  if (
    existingQA?.renderChecklist &&
    existingQA?.renderChecklistScopeHash === scopeHash
  ) {
    return existingQA.renderChecklist as string[];
  }

  // Build user prompt with scope + structured Q&A
  let userContent = `Extract the visual rendering checklist from this room scope:\n\n${room.scopeNarrative}`;
  if (qaText) {
    userContent += `\n\nCLARIFICATION ANSWERS (use these to refine checklist items with specific details):\n${qaText}`;
  }

  // Call Claude to extract visual items
  try {
    const message = await callClaude({
      system: RENDER_CHECKLIST_SYSTEM,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      max_tokens: 1024,
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const items: string[] = JSON.parse(text);
    if (!Array.isArray(items)) return [];

    // Cache result + default-all-checked the new item set atomically. Phase 10:
    // fresh AI extraction replaces the checked set entirely so new items land
    // checked (matches pre-migration UX where everything started checked).
    // User unchecks are lost only when the underlying scope changes — which is
    // also when extraction re-runs, so the invariant "checks reflect current
    // scope" holds.
    const deduped = Array.from(
      new Set(items.map((s) => s.trim()).filter((s) => s.length > 0)),
    );
    await prisma.$transaction([
      prisma.room.update({
        where: { id: roomId },
        data: {
          scopeQA: {
            ...(existingQA ?? {}),
            renderChecklist: items,
            renderChecklistScopeHash: scopeHash,
          },
        },
      }),
      prisma.roomRenderCheck.deleteMany({ where: { roomId } }),
      prisma.roomRenderCheck.createMany({
        data: deduped.map((itemText) => ({ roomId, itemText })),
        skipDuplicates: true,
      }),
    ]);

    // Re-extraction wrote fresh RoomRenderCheck rows; invalidate the project
    // page so the client re-hydrates with the new checked set. Only fires on
    // cache-miss — cache hits return early above.
    revalidatePath(`/admin/projects/${room.projectId}`);

    return items;
  } catch (err) {
    console.error("[extractRenderChecklist] Error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Fast non-crypto hash for cache invalidation. */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// Render helpers (getEffectiveStylePromptForProject, the NON_VISUAL_PATTERNS
// safety net + filterChecklistToPromptSafeVisualActions, sanitizeRoomNameForRender)
// and the render core now live in @/app/lib/gemini/render-room-core so the QStash
// background worker can reuse them. getEffectiveStylePromptForProject and
// renderRoomCore are imported at the top of this file.

/** Which prompt sections to include when building the Gemini render prompt. Omitted or true = include; false = exclude. */
export type RenderPromptIncludes = {
  includeRoomName?: boolean;
  includeScope?: boolean;
  includeTranscript?: boolean;
  includeStylePreset?: boolean;
};

/** Options for Render New: use checklist of specific remodel actions (checked bullets only). */
export type RenderOptions = {
  /** Only these remodel-action bullets are included in the scope sent to Gemini; unchecked are excluded. */
  checkedBullets: string[];
};

/**
 * Start room rendering for the given media (exactly one EXISTING photo).
 * Creates a pending RENDERING Media row with versioning metadata, then generates image via Gemini,
 * uploads to R2, updates the row with url/fileKey/status, and revalidates.
 * On failure, keeps the Media row with renderStatus=FAILED and renderError populated.
 * Style: only project.stylePresetId is used; if set, project.stylePreset.prompt is applied; otherwise no style guidance.
 * When renderOptions.checkedBullets is provided, only those bullets are used as scope; room name and style preset are always included.
 */
export async function startRoomRenderAction(
  projectId: string,
  roomId: string,
  sourceMediaId: string,
  renderOptions?: RenderOptions | null
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

  const effectivePresetId = project.stylePresetId;
  const promptVersion = 1;

  const checkedBullets =
    renderOptions != null &&
    typeof renderOptions === "object" &&
    Array.isArray(renderOptions.checkedBullets)
      ? (renderOptions.checkedBullets as string[]).filter(
          (b) => typeof b === "string" && b.trim().length > 0,
        )
      : null;

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
      renderModel: await _getGeminiImgModel(),
      renderStatus: RenderStatus.QUEUED,
      promptVersion,
    },
  });

  try {
    // Mark as actively rendering while we call the provider.
    await prisma.media.update({
      where: { id: created.id },
      data: { renderStatus: RenderStatus.RENDERING, renderError: null },
    });

    // Prompt build + Gemini + R2 upload — shared with the QStash worker.
    const { publicUrl, fileKey, tags } = await renderRoomCore({
      projectId,
      roomId,
      sourceMediaId: sourceMedia.id,
      createdMediaId: created.id,
      checkedBullets,
    });

    await prisma.media.update({
      where: { id: created.id },
      data: {
        url: publicUrl,
        fileKey,
        tags,
        renderStatus: RenderStatus.DONE,
        renderError: null,
        roomId, // ensure room assignment on completion (e.g. if it was cleared by room delete)
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
        roomId, // ensure room assignment even on failure so it does not appear as unassigned
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

// ─── Render checklist checked-state persistence (Phase 10) ───────────────────
//
// Presence of a RoomRenderCheck row means the item is checked; absence means
// unchecked. Both actions are idempotent.

/**
 * Toggle a single render-checklist item's checked state for a room.
 * Validates admin and project/room ownership. Idempotent.
 */
export async function setRenderCheckAction(
  projectId: string,
  roomId: string,
  itemText: string,
  checked: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!projectId || !roomId || !itemText) {
    return { error: "Missing projectId, roomId, or itemText" };
  }

  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    select: { id: true },
  });
  if (!room) return { error: "Room not found" };

  if (checked) {
    await prisma.roomRenderCheck.upsert({
      where: { roomId_itemText: { roomId, itemText } },
      create: { roomId, itemText },
      update: {},
    });
  } else {
    await prisma.roomRenderCheck.deleteMany({
      where: { roomId, itemText },
    });
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return {};
}

/**
 * Replace the entire checked set for a room with the given items.
 * Used for "check all / uncheck all" and after a fresh AI re-extraction
 * to default newly-extracted items to checked. Idempotent.
 */
export async function setRenderChecksForRoomAction(
  projectId: string,
  roomId: string,
  checkedItems: string[],
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!projectId || !roomId) {
    return { error: "Missing projectId or roomId" };
  }

  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    select: { id: true },
  });
  if (!room) return { error: "Room not found" };

  const deduped = Array.from(
    new Set(
      checkedItems
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );

  await prisma.$transaction([
    prisma.roomRenderCheck.deleteMany({ where: { roomId } }),
    prisma.roomRenderCheck.createMany({
      data: deduped.map((itemText) => ({ roomId, itemText })),
      skipDuplicates: true,
    }),
  ]);

  revalidatePath(`/admin/projects/${projectId}`);
  return {};
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

  // New render must be direct child of root so UI grouping shows it (UI only shows parentMediaId === rootId).
  // sortOrder: max within this concept (root + its direct children) + 1 so version order is v1, v1.1, v1.2.
  const directChildren = await prisma.media.findMany({
    where: {
      projectId,
      roomId,
      type: MediaType.RENDERING,
      parentMediaId: effectiveRootId,
      sourceMediaId: baseRender.sourceMediaId,
    },
    select: { id: true, sortOrder: true },
  });
  const maxOrderInConcept = Math.max(
    rootMedia.sortOrder,
    ...directChildren.map((m) => m.sortOrder),
    -1
  );
  const newSortOrder = maxOrderInConcept + 1;

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
      sortOrder: newSortOrder,
      sourceMediaId: baseRender.sourceMediaId,
      parentMediaId: effectiveRootId,
      editInstruction: trimmed,
      stylePresetId: effectivePresetId,
      renderProvider: "gemini",
      renderModel: await _getGeminiImgModel(),
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
        roomId, // ensure room assignment on completion (e.g. if it was cleared by room delete)
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
        roomId, // ensure room assignment even on failure so it does not appear as unassigned
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

/** 8-char uppercase code: A-Z and 2-9 (excludes 0,1,I,L,O for readability). */
function generatePairCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return code;
}

/**
 * Create a short-lived pair code for the Zillow Import Chrome extension.
 * Admin only. Code expires in 15 minutes.
 */
export async function createExtensionPairCodeAction(
  projectId: string
): Promise<{ code: string; expiresAt: Date } | { error: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  let code = generatePairCode();
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    const existing = await prisma.extensionPairCode.findUnique({ where: { code } });
    if (!existing) break;
    code = generatePairCode();
    attempts++;
  }
  if (attempts >= maxAttempts) {
    return { error: "Failed to generate unique code" };
  }

  await prisma.extensionPairCode.create({
    data: { code, projectId, expiresAt },
  });
  return { code, expiresAt };
}

/**
 * Redeem a pair code (e.g. from Chrome extension). No admin required.
 * Delegates to shared redeemExtensionPairCode for use by API route and action.
 */
export async function redeemExtensionPairCodeAction(
  code: string
): Promise<{ projectId: string } | { error: string }> {
  return redeemExtensionPairCode(code);
}

/** Feature flag: enable direct browser-extension handshake (env: ENABLE_DIRECT_ZILLOW_HANDSHAKE). */
function isDirectZillowHandshakeEnabled(): boolean {
  const v = process.env.ENABLE_DIRECT_ZILLOW_HANDSHAKE;
  return v === "true" || v === "1";
}

/**
 * Start a direct browser connection session for the Zillow Import extension.
 * Returns sessionId, nonce, and expiresAt. Extension uses nonce to call verify endpoint.
 * If direct handshake is disabled via env, returns error so UI can fall back to manual pair code.
 */
export async function startDirectConnectionAction(
  projectId: string
): Promise<
  | { sessionId: string; nonce: string; expiresAt: Date }
  | { error: string }
> {
  if (!isDirectZillowHandshakeEnabled()) {
    return { error: "Direct handshake not enabled" };
  }
  const identity = await requireAdmin();
  const userId = identity.userId;
  if (!userId) return { error: "Unauthorized" };

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };

  const result = await createConnectionSession(userId, projectId);
  if ("error" in result) return { error: result.error };
  return {
    sessionId: result.sessionId,
    nonce: result.nonce,
    expiresAt: result.expiresAt,
  };
}

/**
 * Get current status of a direct connection session (for polling).
 */
export async function getConnectionStatusAction(
  sessionId: string
): Promise<
  | { status: string; projectId: string | null; verifiedAt: Date | null; handshakeMethod: string | null }
  | { error: string }
> {
  const identity = await requireAdmin();
  const userId = identity.userId;
  if (!userId) return { error: "Unauthorized" };

  const result = await getCurrentConnectionStatus(sessionId, userId);
  if ("error" in result) return { error: result.error };
  return {
    status: result.status,
    projectId: result.projectId,
    verifiedAt: result.verifiedAt,
    handshakeMethod: result.handshakeMethod,
  };
}

/**
 * Mark a connection session as failed (e.g. user closed modal or timeout).
 */
export async function markConnectionFailedAction(
  sessionId: string
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  await markConnectionFailed(sessionId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 9 — Bulk Local Media Import
// ---------------------------------------------------------------------------

// The reusable, auth-free core (presign + commit, plus the BULK_* caps and
// extFromContentType) now lives in app/lib/media/upload-pipeline.ts so it can
// be shared with the phone/QR and Google Drive import paths. The two server
// actions below just add the admin-only auth layer on top.

/** Re-exported so existing client imports (LocalImportModal) keep working. */
export type BulkPresignedUrl = PipelineBulkPresignedUrl;

/**
 * Mint one presigned R2 PUT URL per requested file (admin-gated). Delegates to
 * the shared pipeline; the client uploads each file directly to R2 so bytes
 * never touch the Next.js server (sidesteps the 4.5MB serverless body limit).
 */
export async function requestBulkPresignedUrls(
  projectId: string,
  files: { fileName: string; contentType: string; size: number }[]
): Promise<{ urls: BulkPresignedUrl[] } | { error: string }> {
  await requireAdmin();
  return signBulkUploadUrls(projectId, files, "local-import");
}

/** Re-exported so existing client imports (LocalImportModal) keep working. */
export type CreateLocalMediaBatchItem = CommitMediaItem;
export type CreateLocalMediaBatchResult = CommitMediaResult;

/**
 * Create Media rows for a batch of files the client already uploaded to R2 via
 * presigned URLs (admin-gated). Tags them ["local-import", batchId] and
 * delegates the read-back + thumbnail + insert loop to the shared pipeline.
 */
export async function createLocalMediaBatch(
  projectId: string,
  batchId: string,
  items: CreateLocalMediaBatchItem[]
): Promise<CreateLocalMediaBatchResult | { error: string }> {
  await requireAdmin();
  if (!items.length) return { success: [], failed: [] };
  if (items.length > BULK_CREATE_MAX) {
    return {
      error: `Too many items in one batch (${items.length}). Max is ${BULK_CREATE_MAX} per call — chunk on the client.`,
    };
  }
  if (!batchId || !/^batch-[A-Za-z0-9_-]+$/.test(batchId)) {
    return { error: "Invalid batchId — expected batch-<token>" };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };

  return commitMediaBatch({
    projectId,
    items,
    tags: ["local-import", batchId],
  });
}

// ---------------------------------------------------------------------------
// "Send from Phone" — QR upload session
// ---------------------------------------------------------------------------

/**
 * Mint a short-lived, project-scoped upload token (admin-gated) and return the
 * mobile upload URL to encode into a QR code. The salesperson scans it, opens
 * /m/<token> on their phone, and uploads photos straight to R2 — no login.
 */
export async function createPhoneUploadSession(
  projectId: string,
): Promise<{ token: string; url: string; expiresAt: string } | { error: string }> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!base) {
    return {
      error:
        "NEXT_PUBLIC_APP_URL is not set — cannot build the phone upload link.",
    };
  }

  const token = generateUploadToken();
  const expiresAt = new Date(Date.now() + PHOTO_UPLOAD_TOKEN_TTL_MS);
  await prisma.photoUploadToken.create({
    data: { token, projectId, expiresAt },
  });

  return { token, url: `${base}/m/${token}`, expiresAt: expiresAt.toISOString() };
}
