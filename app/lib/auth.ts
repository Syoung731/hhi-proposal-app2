import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * Auth contract for the HHI proposal app.
 *
 * Scope A (private team deployment): every Clerk-authenticated user is a
 * full admin. There is no email allowlist or role check here — Clerk's
 * own dashboard is the source of truth for who can sign in. If we later
 * need a per-email gate, layer it on top of `requireAdmin()`.
 *
 * Defense in depth: `proxy.ts` (Next 16's middleware) is the primary
 * gate. These helpers are called inside route handlers / server
 * components when the code needs `userId` or the user's email. They
 * throw `UnauthorizedError` if Clerk reports no signed-in user — that
 * should never happen for a route the middleware already gates, but
 * keeps the code safe if a route is ever moved out of the gated set.
 */

/** Thrown when a request that should be authenticated has no Clerk session. */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type AdminIdentity = {
  /** Clerk user id (always present for an authenticated request). */
  userId: string;
  /** Primary verified email, or first email on the user, or null. */
  email: string | null;
  /**
   * Full Clerk user object — kept on the return type so callers that
   * need first/last name etc. don't have to re-fetch with `currentUser()`.
   * Populated lazily; null if Clerk's `currentUser()` returned null.
   */
  user: Awaited<ReturnType<typeof currentUser>>;
};

function pickEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  if (!user) return null;
  const primaryId = user.primaryEmailAddressId;
  const primary = primaryId
    ? user.emailAddresses?.find((e) => e.id === primaryId)
    : undefined;
  return primary?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? null;
}

/**
 * Require an authenticated Clerk session. Throws `UnauthorizedError`
 * if no `userId`. Returns `{ userId, email, user }` for callers that
 * need any of those fields.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  const user = await currentUser();
  return { userId, email: pickEmail(user), user };
}

/**
 * Boolean variant — returns true iff the request has a Clerk session.
 * Does not throw. Used by pages that want to render a "not signed in"
 * branch instead of redirecting.
 */
export async function checkIsAdmin(): Promise<boolean> {
  const { userId } = await auth();
  return Boolean(userId);
}

/**
 * Convenience: fetch the signed-in user's primary email. Returns null
 * if no session or no email on file. Does not throw.
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  const user = await currentUser();
  return pickEmail(user);
}
