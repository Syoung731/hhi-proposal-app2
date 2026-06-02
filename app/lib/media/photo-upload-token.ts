import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/prisma";

/**
 * "Send from Phone" upload tokens.
 *
 * A PhotoUploadToken is a short-lived, project-scoped bearer encoded into a QR
 * code. The salesperson's phone opens /m/<token> and uploads photos straight
 * to R2 WITHOUT a Clerk login — the token IS the credential. Mirrors the
 * ExtensionPairCode security model (scoped, time-boxed, revocable).
 */

/** How long a freshly-minted QR link stays valid. Same-day walkthrough use. */
export const PHOTO_UPLOAD_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

/** Per-session safety cap on how many photos one QR link can push. */
export const PHONE_UPLOAD_MAX_FILES = 60;

/** Generate a URL-safe random secret (~32 chars). Travels in a URL/QR. */
export function generateUploadToken(): string {
  return randomBytes(24).toString("base64url");
}

export type VerifiedUploadToken = { projectId: string; tokenId: string };

/**
 * Validate a token presented by the mobile uploader. Returns the bound
 * projectId on success, or a user-facing `{ error }` (never leaks why beyond
 * "invalid/expired/off").
 */
export async function verifyPhotoUploadToken(
  token: string,
): Promise<VerifiedUploadToken | { error: string }> {
  const trimmed = (token ?? "").trim();
  if (!trimmed) return { error: "Missing upload link token" };

  const row = await prisma.photoUploadToken.findUnique({
    where: { token: trimmed },
    select: { id: true, projectId: true, expiresAt: true, revokedAt: true },
  });
  if (!row) return { error: "This upload link is invalid" };
  if (row.revokedAt) return { error: "This upload link has been turned off" };
  if (new Date() > row.expiresAt) return { error: "This upload link has expired" };

  return { projectId: row.projectId, tokenId: row.id };
}

/** Record successful uploads against a token (drives the admin live counter). */
export async function recordPhotoUploadActivity(
  tokenId: string,
  count: number,
): Promise<void> {
  if (count <= 0) return;
  await prisma.photoUploadToken.update({
    where: { id: tokenId },
    data: { uploadCount: { increment: count }, lastUsedAt: new Date() },
  });
}
