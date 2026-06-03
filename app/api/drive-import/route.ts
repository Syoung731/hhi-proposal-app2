import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import {
  commitDownloadedMedia,
  type DownloadedMediaItem,
} from "@/app/lib/media/upload-pipeline";

/**
 * POST /api/drive-import  (admin-gated)
 *
 * Server-side half of the Google Drive import. The browser uses the Google
 * Picker (drive.file scope) to let the user select photos, then sends the
 * picked file IDs + the short-lived OAuth access token here. We download each
 * file's bytes from the Drive API using that token and ingest them into the
 * project's Unassigned bucket (tagged "drive-import") via the shared pipeline.
 *
 * The drive.file scope means the token can ONLY read files the user explicitly
 * picked — never their whole Drive.
 *
 * Body: { projectId, accessToken, files: [{ id, name, mimeType }] }
 * The client chunks files so each call stays well under the time limit.
 */

// Downloading + sharp thumbnailing several photos can take a bit; match the
// other media workers. Client chunks to keep individual calls short anyway.
export const maxDuration = 300;

/** Per-call ceiling — the client chunks larger selections. */
const DRIVE_IMPORT_MAX_PER_CALL = 15;

export async function POST(request: Request) {
  await requireAdmin();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
  const rawFiles = Array.isArray(body.files) ? body.files : [];

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: "Missing Google access token" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (rawFiles.length === 0) {
    return NextResponse.json({ success: [], failed: [] });
  }
  if (rawFiles.length > DRIVE_IMPORT_MAX_PER_CALL) {
    return NextResponse.json(
      { error: `Too many files in one call — max ${DRIVE_IMPORT_MAX_PER_CALL}.` },
      { status: 400 },
    );
  }

  const picked = rawFiles.map((f: unknown) => {
    const o = (f ?? {}) as Record<string, unknown>;
    return {
      id: typeof o.id === "string" ? o.id : "",
      name: typeof o.name === "string" ? o.name : "photo.jpg",
      mimeType: typeof o.mimeType === "string" ? o.mimeType : "",
    };
  });

  // Download each picked file from Drive using the user's access token.
  const downloaded: DownloadedMediaItem[] = [];
  const failed: { fileKey: string; error: string }[] = [];

  for (const f of picked) {
    if (!f.id) {
      failed.push({ fileKey: f.name, error: "Missing file id" });
      continue;
    }
    if (f.mimeType && !f.mimeType.startsWith("image/")) {
      failed.push({ fileKey: f.name, error: "Not an image — skipped" });
      continue;
    }
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        const detail = res.status === 401 || res.status === 403
          ? "Google denied access (token expired or file not shared)"
          : `Drive download failed (${res.status})`;
        failed.push({ fileKey: f.name, error: detail });
        continue;
      }
      const arrayBuf = await res.arrayBuffer();
      const contentType =
        f.mimeType || res.headers.get("content-type") || "image/jpeg";
      downloaded.push({
        buffer: Buffer.from(arrayBuf),
        contentType,
        originalName: f.name,
      });
    } catch (e) {
      failed.push({
        fileKey: f.name,
        error: e instanceof Error ? e.message : "Download error",
      });
    }
  }

  const result = await commitDownloadedMedia({
    projectId,
    items: downloaded,
    tags: ["drive-import"],
  });

  // Merge download-stage failures with commit-stage results.
  return NextResponse.json({
    success: result.success,
    failed: [...failed, ...result.failed],
  });
}
