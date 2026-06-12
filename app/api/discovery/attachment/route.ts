import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { deleteR2Objects } from "@/app/lib/s3";
import {
  discoveryKeyFromRequest,
  isValidDiscoveryKey,
} from "@/app/lib/discovery/auth";
import { isValidQuestionKey } from "@/app/lib/discovery/questions";

const MAX_NAME_LENGTH = 120;

function unauthorized() {
  return NextResponse.json({ error: "Invalid access key" }, { status: 401 });
}

/**
 * POST /api/discovery/attachment — record an upload after the browser has
 * PUT the file to R2 (see /api/discovery/upload for the presign step).
 *
 * Body: { questionKey, fileName, fileKey, publicUrl, contentType?, sizeBytes?, uploadedBy? }
 */
export async function POST(request: Request) {
  if (!isValidDiscoveryKey(discoveryKeyFromRequest(request))) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const questionKey = typeof body.questionKey === "string" ? body.questionKey : "";
  if (!isValidQuestionKey(questionKey)) {
    return NextResponse.json({ error: "Unknown question" }, { status: 400 });
  }

  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 300) : "";
  const fileKey = typeof body.fileKey === "string" ? body.fileKey : "";
  const publicUrl = typeof body.publicUrl === "string" ? body.publicUrl : "";
  // Only accept keys this feature minted — prevents pointing a row at
  // someone else's object (e.g. project media) and deleting it later.
  if (!fileName || !publicUrl || !fileKey.startsWith(`discovery/${questionKey}/`)) {
    return NextResponse.json({ error: "Invalid attachment metadata" }, { status: 400 });
  }

  const attachment = await prisma.discoveryAttachment.create({
    data: {
      questionKey,
      fileName,
      fileKey,
      publicUrl,
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      sizeBytes: typeof body.sizeBytes === "number" ? Math.max(0, Math.round(body.sizeBytes)) : 0,
      uploadedBy: (typeof body.uploadedBy === "string" ? body.uploadedBy : "")
        .trim()
        .slice(0, MAX_NAME_LENGTH),
    },
  });

  return NextResponse.json({ attachment });
}

/**
 * DELETE /api/discovery/attachment?id=... — removes the R2 object first,
 * then the row (same order as project media deletes: never leave a DB row
 * pointing at a deleted object, never strand an object without a row
 * unless the row delete itself fails).
 */
export async function DELETE(request: Request) {
  if (!isValidDiscoveryKey(discoveryKeyFromRequest(request))) return unauthorized();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const attachment = await prisma.discoveryAttachment.findUnique({ where: { id } });
  if (!attachment) return NextResponse.json({ ok: true });

  await deleteR2Objects([attachment.fileKey]);
  await prisma.discoveryAttachment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
