import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/app/lib/prisma";
import { SUPER_ADMIN_EMAIL } from "@/app/lib/constants";

function parseCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** True if the signed-in user is admin (Super Admin, ADMIN_EMAILS / ADMIN_USER_IDS, or Employee.isAdmin). Uses Clerk email. */
export async function checkIsAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  const email =
    user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user.emailAddresses?.[0]?.emailAddress ??
    "";
  const emailLower = email.toLowerCase();

  if (emailLower === SUPER_ADMIN_EMAIL.toLowerCase()) return true;

  const allowEmails = parseCsv(process.env.ADMIN_EMAILS);
  const allowUserIds = parseCsv(process.env.ADMIN_USER_IDS);
  const userId = user.id?.toLowerCase();

  if (allowEmails.length > 0 && allowEmails.includes(emailLower)) return true;
  if (allowUserIds.length > 0 && userId && allowUserIds.includes(userId)) return true;

  try {
    const employee = await prisma.employee.findFirst({
      where: { email: emailLower },
    });
    if (employee?.isAdmin) return true;
  } catch {
    // Fallback: only env list (already checked above)
  }
  return false;
}

export async function requireAdmin() {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");

  const email =
    user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user.emailAddresses?.[0]?.emailAddress ??
    "";
  const emailLower = email.toLowerCase();

  if (emailLower === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return { user, email: emailLower, userId: user.id };
  }

  const allowEmails = parseCsv(process.env.ADMIN_EMAILS);
  const allowUserIds = parseCsv(process.env.ADMIN_USER_IDS);
  const userId = user.id?.toLowerCase();
  const okByEmail = allowEmails.length > 0 && allowEmails.includes(emailLower);
  const okById = allowUserIds.length > 0 && userId && allowUserIds.includes(userId);

  if (!okByEmail && !okById) {
    try {
      const employee = await prisma.employee.findFirst({
        where: { email: emailLower },
      });
      if (employee?.isAdmin) {
        return { user, email: emailLower, userId: user.id };
      }
    } catch {
      // If employee lookup fails, fall back to env only (already checked)
    }
    throw new Error(
      `Forbidden: admin access only (userId=${user.id}, email=${emailLower || "none"})`
    );
  }

  return { user, email: emailLower, userId: user.id };
}