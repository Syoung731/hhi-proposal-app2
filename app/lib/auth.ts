import { auth } from "@clerk/nextjs/server";

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean) ?? [];
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];

export async function requireAdmin(): Promise<{ userId: string; email: string | null }> {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }
  const email = (sessionClaims?.email as string | undefined) ?? null;
  const emailLower = email?.toLowerCase();
  const allowedByEmail = ADMIN_EMAILS.length > 0 && emailLower && ADMIN_EMAILS.includes(emailLower);
  const allowedByUserId = ADMIN_USER_IDS.length > 0 && ADMIN_USER_IDS.includes(userId);
  if (!allowedByEmail && !allowedByUserId) {
    throw new Error("Forbidden: admin access only");
  }
  return { userId, email };
}

export function isAdminAllowlistConfigured(): boolean {
  return ADMIN_EMAILS.length > 0 || ADMIN_USER_IDS.length > 0;
}
