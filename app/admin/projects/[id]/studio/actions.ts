"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { MediaKind, MediaPlacement, MediaType } from "@/app/generated/prisma";
import {
  signBulkUploadUrls,
  commitMediaBatch,
  type BulkPresignedUrl,
  type CommitMediaItem,
  type CommitMediaResult,
} from "@/app/lib/media/upload-pipeline";
import {
  setProjectHeroMediaAction,
  startRoomRenderAction,
  extractRenderChecklistAction,
} from "../media/actions";
import { detectPhotoFixtures } from "@/app/lib/gemini";
import {
  reconcileScopeWithPhoto,
  type AnnotatedRenderItem,
} from "@/app/lib/media/render-scope-reconcile";

/**
 * Server actions for the Presentation Studio "Build Presentation" wizard
 * (Phase 1). The wizard walks the user through a hero photo + per-room photos;
 * rooms that end up with photos become before/after candidates, rooms without
 * roll up into "Additional Rooms" scope-breakdown slides downstream.
 *
 * These reuse the shared upload pipeline (presign → direct-to-R2 → commit),
 * just assigning the created media to the right room/placement.
 */

export type StudioRoomReadiness = {
  id: string;
  name: string;
  photoCount: number;
  /** "ready" = has photos (before/after candidate); "additional" = none yet. */
  status: "ready" | "additional";
};

export type StudioReadiness = {
  rooms: StudioRoomReadiness[];
  hero: { mediaId: string; url: string } | null;
};

/** Per-room photo counts + current hero, for the wizard's readiness display. */
export async function getStudioReadiness(
  projectId: string,
): Promise<StudioReadiness | { error: string }> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, coverHeroImageId: true },
  });
  if (!project) return { error: "Project not found" };

  const rooms = await prisma.room.findMany({
    where: { projectId, isProjectOverhead: false },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  const roomIds = rooms.map((r) => r.id);
  const counts = roomIds.length
    ? await prisma.media.groupBy({
        by: ["roomId"],
        where: { projectId, roomId: { in: roomIds }, type: MediaType.EXISTING },
        _count: { _all: true },
      })
    : [];
  const countByRoom = new Map(
    counts.map((c) => [c.roomId, c._count._all] as const),
  );

  let hero: StudioReadiness["hero"] = null;
  if (project.coverHeroImageId) {
    const h = await prisma.media.findUnique({
      where: { id: project.coverHeroImageId },
      select: { id: true, url: true },
    });
    if (h?.url) hero = { mediaId: h.id, url: h.url };
  }

  return {
    hero,
    rooms: rooms.map((r) => {
      const n = countByRoom.get(r.id) ?? 0;
      return {
        id: r.id,
        name: r.name,
        photoCount: n,
        status: n > 0 ? ("ready" as const) : ("additional" as const),
      };
    }),
  };
}

type PresignFile = { fileName: string; contentType: string; size: number };

/** Mint presigned R2 URLs for studio uploads (hero when roomId is null). */
export async function requestStudioPresignedUrls(
  projectId: string,
  roomId: string | null,
  files: PresignFile[],
): Promise<{ urls: BulkPresignedUrl[] } | { error: string }> {
  await requireAdmin();
  if (roomId) {
    const room = await prisma.room.findFirst({
      where: { id: roomId, projectId },
      select: { id: true },
    });
    if (!room) return { error: "Room not found in this project" };
  }
  return signBulkUploadUrls(projectId, files, "studio");
}

/** Commit room walkthrough photos (assigned to the room as BEFORE/SECTION). */
export async function commitStudioRoomPhotos(
  projectId: string,
  roomId: string,
  items: CommitMediaItem[],
): Promise<CommitMediaResult | { error: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    select: { id: true },
  });
  if (!room) return { error: "Room not found in this project" };

  return commitMediaBatch({
    projectId,
    items,
    tags: ["studio"],
    roomId,
    placement: MediaPlacement.SECTION,
    kind: MediaKind.BEFORE,
  });
}

/** Commit a hero photo (project-level) and set it as the cover hero. */
export async function commitStudioHeroPhoto(
  projectId: string,
  items: CommitMediaItem[],
): Promise<(CommitMediaResult & { heroSet: boolean }) | { error: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };

  const result = await commitMediaBatch({
    projectId,
    items,
    tags: ["studio", "hero"],
    roomId: null,
    placement: MediaPlacement.FRONT_PAGE,
    kind: MediaKind.COVER,
  });

  let heroSet = false;
  const firstId = result.success[0]?.id;
  if (firstId) {
    const res = await setProjectHeroMediaAction(projectId, firstId);
    heroSet = !("error" in res) || !res.error;
  }

  return { ...result, heroSet };
}

// ─── Before/After render: scope-aware, photo-aware (Phase 2) ─────────────────────

export type RoomRenderPrep = {
  roomId: string;
  /** Primary before photo to render from (null = no photos → Additional Room). */
  beforeMedia: { id: string; url: string } | null;
  /** Scope items annotated with photo visibility + render recommendation. */
  items: AnnotatedRenderItem[];
};

/**
 * Prepare the before/after render review for one room: pick its before photo,
 * get the scope checklist (generates/caches via extractRenderChecklistAction),
 * run a Gemini vision pass to see what's actually in the photo, and reconcile
 * the two so the UI can ask "render the shower/vanity?" only where it makes
 * sense — never hallucinating fixtures that aren't visible.
 */
export async function prepareRoomRender(
  projectId: string,
  roomId: string,
): Promise<RoomRenderPrep | { error: string }> {
  await requireAdmin();

  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    select: {
      id: true,
      media: {
        where: { type: MediaType.EXISTING },
        orderBy: { sortOrder: "asc" },
        select: { id: true, url: true },
      },
    },
  });
  if (!room) return { error: "Room not found in this project" };

  const before =
    room.media.find((m) => m.url && m.url.trim() !== "") ?? null;

  // Scope checklist (cached on the room; generated from scope if needed).
  const checklist = await extractRenderChecklistAction(roomId);

  // Vision pass only when we have a photo to look at.
  const detected = before
    ? (await detectPhotoFixtures(before.url)).fixtures
    : [];

  return {
    roomId,
    beforeMedia: before ? { id: before.id, url: before.url } : null,
    items: reconcileScopeWithPhoto(checklist, detected),
  };
}

/**
 * Generate a before/after render for a room from the confirmed scope items, then
 * select it so the deck's before/after slide auto-builds. Reuses the existing
 * render path (anti-hallucination guardrails + prompt-safe filtering). Runs
 * synchronously per room — fine for one-at-a-time studio use.
 */
export async function renderRoomFromStudio(
  projectId: string,
  roomId: string,
  sourceMediaId: string,
  confirmedItems: string[],
): Promise<{ ok: true; mediaId: string } | { error: string }> {
  await requireAdmin();

  const res = await startRoomRenderAction(projectId, roomId, sourceMediaId, {
    checkedBullets: confirmedItems,
  });
  if ("error" in res) return { error: res.error };

  // Select the new render so syncBeforeAfterSlides builds the slide.
  await prisma.room.update({
    where: { id: roomId },
    data: { selectedRenderMediaId: res.createdMediaId },
  });
  revalidatePath(`/admin/projects/${projectId}`);

  return { ok: true, mediaId: res.createdMediaId };
}
