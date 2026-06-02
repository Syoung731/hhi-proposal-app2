import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

/**
 * GET /api/phone-upload/status?token=...
 *
 * Lightweight poll used by the admin QR modal to show a live "N photos
 * received" counter and validity. Returns minimal, non-sensitive info.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ valid: false, uploadCount: 0 });
  }

  const row = await prisma.photoUploadToken.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      revokedAt: true,
      uploadCount: true,
      project: { select: { title: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ valid: false, uploadCount: 0 });
  }

  const valid = !row.revokedAt && new Date() <= row.expiresAt;
  return NextResponse.json({
    valid,
    uploadCount: row.uploadCount,
    expiresAt: row.expiresAt.toISOString(),
    projectTitle: row.project?.title ?? null,
  });
}
