import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/app/lib/prisma";
import { RenderStatus } from "@/app/generated/prisma";
import { renderRoomCore } from "@/app/lib/gemini/render-room-core";
import type { StudioRenderWorkerPayload } from "@/app/lib/media/studio-render-job";

/**
 * POST /api/jobs/studio-render — QStash worker for background before/after renders.
 *
 * Receives a payload referencing a QUEUED RENDERING Media row, runs the shared
 * renderRoomCore (Gemini + R2), and transitions the row DONE/FAILED. Status is
 * the Media.renderStatus the studio polls. Idempotent: a row already DONE is a
 * no-op (handles QStash redelivery). On error we record FAILED and return 200
 * so QStash doesn't loop — the user can re-queue.
 *
 * Gemini render + R2 upload can take ~30-120s; give the route headroom.
 */
export const maxDuration = 300;

async function handler(request: Request): Promise<Response> {
  let body: StudioRenderWorkerPayload | null = null;
  try {
    body = (await request.json()) as StudioRenderWorkerPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectId, roomId, sourceMediaId, createdMediaId, checkedBullets } =
    body ?? ({} as StudioRenderWorkerPayload);
  if (!projectId || !roomId || !sourceMediaId || !createdMediaId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const media = await prisma.media.findUnique({
    where: { id: createdMediaId },
    select: { id: true, renderStatus: true },
  });
  if (!media) {
    return NextResponse.json({ status: "not_found" }, { status: 200 });
  }
  if (media.renderStatus === RenderStatus.DONE) {
    return NextResponse.json({ status: "already_done" }, { status: 200 });
  }

  await prisma.media.update({
    where: { id: createdMediaId },
    data: { renderStatus: RenderStatus.RENDERING, renderError: null },
  });

  try {
    const { publicUrl, fileKey, tags } = await renderRoomCore({
      projectId,
      roomId,
      sourceMediaId,
      createdMediaId,
      checkedBullets,
    });

    await prisma.media.update({
      where: { id: createdMediaId },
      data: {
        url: publicUrl,
        fileKey,
        tags,
        renderStatus: RenderStatus.DONE,
        renderError: null,
        roomId,
      },
    });

    // Deck re-syncs from the fresh render on next /deck load.
    revalidatePath(`/admin/projects/${projectId}/deck`);
    revalidatePath(`/admin/projects/${projectId}`);

    return NextResponse.json({ status: "completed", mediaId: createdMediaId });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await prisma.media
      .update({
        where: { id: createdMediaId },
        data: {
          renderStatus: RenderStatus.FAILED,
          renderError: reason.slice(0, 500),
          roomId,
        },
      })
      .catch(() => {});
    return NextResponse.json({ status: "failed", error: reason }, { status: 200 });
  }
}

export const POST = verifySignatureAppRouter(handler);
