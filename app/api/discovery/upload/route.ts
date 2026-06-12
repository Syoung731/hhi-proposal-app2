import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getPresignedUploadUrl, isStorageConfigured } from "@/app/lib/s3";
import {
  discoveryKeyFromRequest,
  isValidDiscoveryKey,
} from "@/app/lib/discovery/auth";
import { isValidQuestionKey } from "@/app/lib/discovery/questions";

/** Generous — brand guides, photo sets, and video clips are expected. */
const DISCOVERY_MAX_FILE_BYTES = 500 * 1024 * 1024;

function sanitizeFileName(name: string): string {
  const trimmed = name.split(/[\\/]/).pop() ?? "file";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 140) || "file";
}

/**
 * POST /api/discovery/upload
 *
 * Mints a presigned R2 PUT URL for one file. The browser uploads directly
 * to R2 (same pattern as the phone-upload flow — no Vercel body-size limit
 * in the path), then commits metadata via POST /api/discovery/attachment.
 *
 * Body: { questionKey, fileName, contentType, size }
 * Returns: { uploadUrl, fileKey, publicUrl }
 */
export async function POST(request: Request) {
  if (!isValidDiscoveryKey(discoveryKeyFromRequest(request))) {
    return NextResponse.json({ error: "Invalid access key" }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "File storage is not configured" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const questionKey = typeof body.questionKey === "string" ? body.questionKey : "";
  if (!isValidQuestionKey(questionKey)) {
    return NextResponse.json({ error: "Unknown question" }, { status: 400 });
  }

  const fileName = sanitizeFileName(
    typeof body.fileName === "string" ? body.fileName : "file",
  );
  const contentType =
    typeof body.contentType === "string" && body.contentType
      ? body.contentType
      : "application/octet-stream";
  const size = typeof body.size === "number" ? body.size : 0;
  if (size > DISCOVERY_MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File is too large — max 500 MB per file." },
      { status: 400 },
    );
  }

  const fileKey = `discovery/${questionKey}/${randomUUID()}-${fileName}`;
  const signed = await getPresignedUploadUrl(fileKey, contentType);

  return NextResponse.json(signed);
}
