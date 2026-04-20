/**
 * Current-employee identity shim.
 *
 * Clerk auth is currently disabled (see app/lib/auth.ts — stub returns a
 * hard-coded dev user). The send-to-client flow still needs a real
 * `Employee.id` for:
 *   - quota accounting on sendProposalEmail()
 *   - sentByEmployeeId on PublishedSnapshot
 *   - attribution on PdfDownloadLog / ShareLinkCopyLog / EmailSendLog
 *
 * This helper bridges that gap in dev. Priority order:
 *   1. process.env.DEV_EMPLOYEE_ID — explicit override, wins if set AND the id
 *      resolves to a real active employee. Lets a developer pin their own
 *      identity on their own machine without editing DB rows.
 *   2. First active admin employee (isActive=true, isAdmin=true), ordered by
 *      sortOrder then createdAt. Deterministic fallback so two machines
 *      without the env var still agree on who sent what.
 *   3. First active employee — last resort if no admin exists yet.
 *
 * If no candidate is found the function throws. Never returns an invalid id;
 * callers can depend on the FK being satisfiable.
 *
 * # When Clerk comes back
 * The shape of this helper stays — `getCurrentEmployeeId(): Promise<string>`
 * — but the implementation becomes `clerkUserId -> Employee.clerkUserId` (a
 * field that will be added at that time). The DEV_EMPLOYEE_ID override can
 * remain as a dev-only escape hatch or be deleted. Send-flow callers should
 * not be aware of any of this — they just await this function.
 *
 * # Why a separate module from auth.ts
 * auth.ts is the admin-gate (checkIsAdmin, requireAdmin) — it answers "is
 * this request allowed?" This module answers "who should the DB row
 * attribute this action to?" Two distinct concerns that happen to share a
 * future Clerk integration; kept separate so restoring one doesn't drag the
 * other along for the ride.
 */

import "server-only";
import { prisma } from "@/app/lib/prisma";

/** Env var name exported so callers + docs can reference it symbolically. */
export const DEV_EMPLOYEE_ID_ENV = "DEV_EMPLOYEE_ID";

/** Thrown when no identifiable employee can be resolved for the current request. */
export class NoCurrentEmployeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoCurrentEmployeeError";
  }
}

/**
 * Resolve the Employee.id that should be credited for the current action.
 * See the module docstring for the resolution order.
 *
 * Throws NoCurrentEmployeeError if nothing resolves. Callers in the send
 * flow should let this propagate — it's an operator error (no employees
 * seeded) rather than a user error.
 */
export async function getCurrentEmployeeId(): Promise<string> {
  const override = process.env[DEV_EMPLOYEE_ID_ENV]?.trim();
  if (override) {
    const hit = await prisma.employee.findFirst({
      where: { id: override, isActive: true },
      select: { id: true },
    });
    if (hit) return hit.id;
    // Fall through to fallback resolution if the override points at a
    // stale/inactive/deleted id — don't error out, don't silently use a
    // different identity either. The fallback below is deterministic.
  }

  const admin = await prisma.employee.findFirst({
    where: { isActive: true, isAdmin: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (admin) return admin.id;

  const anyActive = await prisma.employee.findFirst({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (anyActive) return anyActive.id;

  throw new NoCurrentEmployeeError(
    `No active employee found to attribute this action to. Seed at least one Employee row, or set ${DEV_EMPLOYEE_ID_ENV} to a valid Employee.id.`,
  );
}

/**
 * Load a minimal employee record for the current request — convenience for
 * callers that need name/email/signature fields and don't want to redo the
 * lookup after getCurrentEmployeeId(). Returns null only if the id resolved
 * but the row was deleted between queries; callers should treat that as an
 * error condition.
 */
export async function getCurrentEmployee() {
  const id = await getCurrentEmployeeId();
  return prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      jobTitle: true,
      headshotUrl: true,
      signatureQuote: true,
      directPhone: true,
      mobilePhone: true,
      linkedInUrl: true,
      signatureEnabled: true,
      isActive: true,
      isAdmin: true,
    },
  });
}
