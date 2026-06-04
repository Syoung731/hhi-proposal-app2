"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { MediaKind, MediaPlacement, MediaType, RenderStatus } from "@/app/generated/prisma";
import { getGeminiImageModel } from "@/app/lib/ai/gemini-models";
import { publishStudioRenderMessage } from "@/app/lib/media/studio-render-job";
import { renderRoomCore } from "@/app/lib/gemini/render-room-core";
import {
  signBulkUploadUrls,
  commitMediaBatch,
  type BulkPresignedUrl,
  type CommitMediaItem,
  type CommitMediaResult,
} from "@/app/lib/media/upload-pipeline";
import {
  setProjectHeroMediaAction,
  extractRenderChecklistAction,
} from "../media/actions";
import { detectPhotoFixtures } from "@/app/lib/gemini";
import {
  reconcileScopeWithPhoto,
  type AnnotatedRenderItem,
} from "@/app/lib/media/render-scope-reconcile";
import { composeDeckCopy, type ComposeCopyResult } from "@/app/lib/deck/compose-copy";

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
  sourceMediaId?: string,
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

  const usable = room.media.filter((m) => m.url && m.url.trim() !== "");
  const before =
    (sourceMediaId ? usable.find((m) => m.id === sourceMediaId) : null) ??
    usable[0] ??
    null;

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
 * Queue a before/after render as a QStash background job (Phase 2b). Creates a
 * QUEUED render row, selects it (so the before/after slide builds when DONE),
 * and publishes to the worker. Returns immediately — the studio polls
 * getRoomRenderStatus to watch progress without blocking.
 */
export async function queueStudioRender(
  projectId: string,
  roomId: string,
  sourceMediaId: string,
  confirmedItems: string[],
): Promise<{ ok: true; mediaId: string } | { error: string }> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, stylePresetId: true },
  });
  if (!project) return { error: "Project not found" };

  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    select: { id: true },
  });
  if (!room) return { error: "Room not found in this project" };

  const source = await prisma.media.findFirst({
    where: { id: sourceMediaId, projectId, roomId, type: MediaType.EXISTING },
    select: { id: true },
  });
  if (!source) return { error: "Source photo not found" };

  const rootCount = await prisma.media.count({
    where: { projectId, roomId, type: MediaType.RENDERING, parentMediaId: null },
  });
  if (rootCount >= 3) {
    return { error: "Max 3 renders per section — delete one to generate another." };
  }

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
      fileKey: `renderings/pending/${sourceMediaId}/${Date.now()}`,
      caption: null,
      tags: [],
      sortOrder: maxOrder + 1,
      sourceMediaId,
      stylePresetId: project.stylePresetId,
      renderProvider: "gemini",
      renderModel: await getGeminiImageModel(),
      renderStatus: RenderStatus.QUEUED,
      promptVersion: 1,
    },
    select: { id: true },
  });

  // Select it now so syncBeforeAfterSlides builds the slide once it's DONE.
  await prisma.room.update({
    where: { id: roomId },
    data: { selectedRenderMediaId: created.id },
  });

  // Prefer the background QStash worker. If QStash isn't configured or the
  // publish can't connect (e.g. local dev without the qstash-cli proxy), fall
  // back to rendering synchronously inline so the feature still works — the
  // studio's status poll will simply see DONE on its next tick.
  const qstashConfigured = !!(process.env.QSTASH_TOKEN ?? "")
    .replace(/['"]/g, "")
    .trim();
  let queued = false;
  if (qstashConfigured) {
    try {
      await publishStudioRenderMessage({
        projectId,
        roomId,
        sourceMediaId,
        createdMediaId: created.id,
        checkedBullets: confirmedItems,
      });
      queued = true;
    } catch {
      queued = false; // fall through to synchronous render
    }
  }

  if (!queued) {
    try {
      await prisma.media.update({
        where: { id: created.id },
        data: { renderStatus: RenderStatus.RENDERING, renderError: null },
      });
      const { publicUrl, fileKey, tags } = await renderRoomCore({
        projectId,
        roomId,
        sourceMediaId,
        createdMediaId: created.id,
        checkedBullets: confirmedItems,
      });
      await prisma.media.update({
        where: { id: created.id },
        data: {
          url: publicUrl,
          fileKey,
          tags,
          renderStatus: RenderStatus.DONE,
          renderError: null,
          roomId,
        },
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Render failed";
      await prisma.media
        .update({
          where: { id: created.id },
          data: { renderStatus: RenderStatus.FAILED, renderError: reason.slice(0, 500), roomId },
        })
        .catch(() => {});
      return { error: `Render failed: ${reason}` };
    }
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true, mediaId: created.id };
}

export type RoomRenderStatus = {
  status: "QUEUED" | "RENDERING" | "DONE" | "FAILED" | "unknown";
  error?: string | null;
};

/** Poll a render's status (studio watches this after queueing). */
export async function getRoomRenderStatus(
  mediaId: string,
): Promise<RoomRenderStatus> {
  await requireAdmin();
  const m = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { renderStatus: true, renderError: true },
  });
  if (!m?.renderStatus) return { status: "unknown" };
  return { status: m.renderStatus, error: m.renderError };
}

export type StudioRenderState = {
  selectedRenderMediaId: string | null;
  photos: { id: string; url: string; thumbnailUrl: string | null }[];
  renders: {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    sourceMediaId: string | null;
    parentMediaId: string | null;
    status: "QUEUED" | "RENDERING" | "DONE" | "FAILED";
    error: string | null;
  }[];
};

/** Full render state for a room: its before photos, all renders, and the selected one. */
export async function getRoomRenderState(
  projectId: string,
  roomId: string,
): Promise<StudioRenderState | { error: string }> {
  await requireAdmin();
  const room = await prisma.room.findFirst({
    where: { id: roomId, projectId },
    select: {
      selectedRenderMediaId: true,
      media: {
        where: { OR: [{ type: MediaType.EXISTING }, { type: MediaType.RENDERING }] },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          url: true,
          thumbnailUrl: true,
          type: true,
          sourceMediaId: true,
          parentMediaId: true,
          renderStatus: true,
          renderError: true,
        },
      },
    },
  });
  if (!room) return { error: "Room not found in this project" };

  const photos = room.media
    .filter((m) => m.type === MediaType.EXISTING && m.url && m.url.trim() !== "")
    .map((m) => ({ id: m.id, url: m.url, thumbnailUrl: m.thumbnailUrl }));

  const renders = room.media
    .filter((m) => m.type === MediaType.RENDERING)
    .map((m) => ({
      id: m.id,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      sourceMediaId: m.sourceMediaId,
      parentMediaId: m.parentMediaId,
      status: (m.renderStatus ?? (m.url ? "DONE" : "QUEUED")) as
        | "QUEUED"
        | "RENDERING"
        | "DONE"
        | "FAILED",
      error: m.renderError,
    }));

  return { selectedRenderMediaId: room.selectedRenderMediaId, photos, renders };
}

/**
 * AI deck composer (Phase 3): draft client-facing slide copy from project data.
 * Non-destructive — skips sync-owned + user-edited slides. Requires the deck to
 * exist (open the Presentation Deck once first).
 */
export async function composeDeckCopyAction(
  projectId: string,
): Promise<ComposeCopyResult | { error: string }> {
  await requireAdmin();
  return composeDeckCopy(projectId);
}
