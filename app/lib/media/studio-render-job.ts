import "server-only";
import { getQstashClient } from "@/app/lib/ai/estimate-job";

/**
 * QStash publisher for the Presentation Studio background render (Phase 2b).
 * Enqueues a before/after render so it runs in the worker instead of blocking
 * the request — lets the user queue several rooms and walk away. Reuses the
 * shared QStash client; status is tracked on the Media row (renderStatus).
 */

export const STUDIO_RENDER_FLOW_CONTROL_KEY = "hhi-studio-render";

export interface StudioRenderWorkerPayload {
  projectId: string;
  roomId: string;
  sourceMediaId: string;
  /** The QUEUED Media row id — also the idempotency key. */
  createdMediaId: string;
  /** Confirmed scope items to render (null/empty = full scope narrative). */
  checkedBullets?: string[] | null;
}

function resolveStudioRenderWorkerUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/['"]/g, "").trim();
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set — required to build the studio render QStash webhook URL.",
    );
  }
  return `${base.replace(/\/+$/, "")}/api/jobs/studio-render`;
}

/** Publish one studio render message. parallelism caps concurrent Gemini calls. */
export async function publishStudioRenderMessage(
  payload: StudioRenderWorkerPayload,
): Promise<void> {
  await getQstashClient().publishJSON({
    url: resolveStudioRenderWorkerUrl(),
    body: payload,
    retries: 3,
    flowControl: {
      key: STUDIO_RENDER_FLOW_CONTROL_KEY,
      parallelism: 3,
    },
  });
}
