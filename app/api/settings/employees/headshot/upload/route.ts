import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getPresignedUploadUrl } from "@/app/lib/s3";

/**
 * Presigned upload endpoint for Employee headshots.
 *
 * Forked from /api/settings/branding/upload — same two-step pattern
 * (client requests presigned URL → client PUTs binary to R2 → client
 * persists publicUrl via updateEmployee), with two differences:
 *   - Requires an employeeId in the request body so the object key can be
 *     scoped per-employee (enables easy cleanup when an employee record is
 *     deleted, and prevents filename collisions between employees).
 *   - Accepts a broader range of image types (branding is svg/png/webp;
 *     headshots can also be jpeg/jpg, which is what most cameras emit).
 *
 * Key format: settings/employees/{employeeId}/{timestamp}-{sanitized-name}
 */

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

function sanitizeFileName(fileName: string): string {
  const base = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if ((ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return base.endsWith(`.${ext}`) ? base : `${base}.${ext}`;
  }
  return base || "headshot";
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  let body: { employeeId?: string; fileName?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const employeeId =
    typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  const fileName =
    typeof body.fileName === "string" ? body.fileName.trim() : "";
  const contentType =
    typeof body.contentType === "string" ? body.contentType.trim() : "";

  if (!employeeId || !fileName || !contentType) {
    return NextResponse.json(
      { error: "employeeId, fileName, and contentType are required" },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.includes(contentType as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { error: "contentType must be image/png, image/jpeg, or image/webp" },
      { status: 400 },
    );
  }

  // Confirm the employeeId is real before minting a URL — cheap guard against
  // arbitrary callers burning R2 object keys on non-existent employees.
  const exists = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const sanitized = sanitizeFileName(fileName);
  const timestamp = Date.now();
  const fileKey = `settings/employees/${employeeId}/${timestamp}-${sanitized}`;

  try {
    const { uploadUrl, publicUrl } = await getPresignedUploadUrl(
      fileKey,
      contentType,
    );
    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to generate upload URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
